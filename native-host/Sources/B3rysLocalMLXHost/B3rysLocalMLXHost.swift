import Darwin
import Foundation
import MLX
import MLXHuggingFace
import MLXLLM
import MLXLMCommon
import Tokenizers

private let maximumMessageBytes = 8 * 1024 * 1024

private enum B3rysModelRegistration {
  /// MLX Swift supports the Gemma families directly. Hy-MT2 uses its own
  /// Hunyuan architecture, so register the local implementation before the
  /// factory examines a downloaded Hy model configuration.
  static func registerModelTypes() async {
    await LLMTypeRegistry.shared.registerModelType(
      "hunyuan_v1_dense",
      creator: { data in
        let configuration = try JSONDecoder.json5().decode(
          HunyuanV1DenseConfiguration.self,
          from: data
        )
        return HunyuanV1DenseModel(configuration)
      }
    )
  }
}

private enum LocalModel: String, Codable, CaseIterable {
  case gemma4E4B = "gemma4-e4b-q4"
  case gemma4_12B = "gemma4-12b-q4"
  case translateGemma4B = "translategemma-4b-it-q4"
  case translateGemma12B = "translategemma-12b-it-q4"
  case hy18B = "hy-mt2-1.8b-q4"
  case hy7B = "hy-mt2-7b-q4"

  var directory: String {
    switch self {
    case .gemma4E4B: "gemma4-e4b-q4/475b9088d29754a3379866cf5aeb6b41acd313c2"
    case .gemma4_12B: "gemma4-12b-q4/73bcf09092aa277861d5a191b989b666f7f32e8f"
    case .translateGemma4B: "translategemma-4b-it-q4/5788ec08c047f3f2e17808101b8d9566ac930d58"
    case .translateGemma12B: "translategemma-12b-it-q4/f3dcfd54df14672fbcf0731086fb47a797a943ae"
    case .hy18B: "hy-mt2-1.8b-q4/e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912"
    case .hy7B: "hy-mt2-7b-q4/9b7204bdb161490a8ce49ce607c1310cc3fd03ad"
    }
  }
}

private struct TranslationItem: Codable { let id: String; let text: String }
private struct ContextItem: Codable { let original: String; let translated: String }
private struct Request: Codable {
  let type: String; let requestId: String; let modelId: LocalModel?
  let paragraphs: [TranslationItem]?; let mode: String?; let subtitleContext: [ContextItem]?
  let sourceLang: String?; let targetLang: String?
}
private struct ErrorValue: Codable { let code: String; let message: String }
private struct Response: Codable {
  let requestId: String; let translations: [Translation]?; let error: ErrorValue?
  struct Translation: Codable { let id: String; let translatedText: String }
}

private final class Engine {
  private var resident: (model: LocalModel, path: URL, container: ModelContainer)?

  func translate(_ request: Request) async throws -> [Response.Translation] {
    guard let model = request.modelId, let paragraphs = request.paragraphs, !paragraphs.isEmpty else { throw HostError.invalidRequest }
    let root = try modelRoot()
    let path = try verifiedDirectory(root: root, model: model)
    let container: ModelContainer
    if let resident, resident.model == model, resident.path == path { container = resident.container }
    else {
      self.resident = nil
      Memory.clearCache()
      container = try await LLMModelFactory.shared.loadContainer(from: path, using: #huggingFaceTokenizerLoader())
      self.resident = (model, path, container)
    }
    var results: [Response.Translation] = []
    for item in paragraphs {
      try Task.checkCancellation()
      let prompt = formattedPromptFor(item: item, request: request, model: model)
      let promptTokenCount = await container.encode(prompt).count
      guard promptTokenCount <= maximumInputTokens(for: model) else {
        throw HostError.inputTooLong
      }
      let sourceTokenCount = await container.encode(plainText(item.text)).count
      let generated = try await generate(
        container: container,
        prompt: prompt,
        maxTokens: outputTokenBudget(
          sourceTokenCount: sourceTokenCount,
          promptTokenCount: promptTokenCount,
          model: model
        ),
        model: model
      )
      // A max-token cutoff can look like a valid translation while ending in
      // the middle of a sentence. Never inject or cache such output.
      guard case .stop = generated.stopReason else { throw HostError.invalidOutput }
      let text = normalizedTranslation(generated.text, model: model)
      guard !text.isEmpty,
        text.utf8.count <= maximumMessageBytes,
        targetLanguageLooksPlausible(text, target: request.targetLang ?? "ko")
      else { throw HostError.invalidOutput }
      results.append(.init(id: item.id, translatedText: text))
      Memory.clearCache()
    }
    return results
  }

  private func modelRoot() throws -> URL {
    if let configured = ProcessInfo.processInfo.environment["B3RYS_MODEL_ROOT"], !configured.isEmpty {
      return URL(filePath: configured, directoryHint: .isDirectory).standardizedFileURL
    }
    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
    var current = executable.deletingLastPathComponent()
    for _ in 0..<8 {
      let candidate = current.appending(path: ".local-models", directoryHint: .isDirectory)
      if FileManager.default.fileExists(atPath: candidate.path) { return candidate }
      current.deleteLastPathComponent()
    }
    throw HostError.modelsNotFound
  }

  private func verifiedDirectory(root: URL, model: LocalModel) throws -> URL {
    let root = root.resolvingSymlinksInPath()
    let directory = root.appending(path: model.directory, directoryHint: .isDirectory).resolvingSymlinksInPath()
    guard directory.path.hasPrefix(root.path + "/"), FileManager.default.fileExists(atPath: directory.appending(path: "config.json").path), FileManager.default.fileExists(atPath: directory.appending(path: "tokenizer.json").path) else { throw HostError.modelsNotFound }
    return directory
  }

  private func formattedPromptFor(item: TranslationItem, request: Request, model: LocalModel) -> String {
    let source = normalizedLanguageCode(request.sourceLang ?? "en")
    let target = normalizedLanguageCode(request.targetLang ?? "ko")
    let sourceText = plainText(item.text)
    let sourceName = languageName(source)
    let targetName = languageName(target)

    switch model {
    case .gemma4E4B:
      return "<bos><|turn>user\nTranslate the following \(sourceName) text into \(targetName):\n\n\(sourceText)<turn|>\n<|turn>model\n"
    case .gemma4_12B:
      // The non-thinking template opens and immediately closes an empty
      // thought channel, then the model emits its final answer. Its turn
      // terminator is `<turn|>` (not `<|turn>`).
      return "<bos><|turn>user\nTranslate the following \(sourceName) text into \(targetName):\n\n\(sourceText)<turn|>\n<|turn>model\n<|channel>thought\n<channel|>"
    case .translateGemma4B, .translateGemma12B:
      // TranslateGemma's template is not a generic chat prompt: its single
      // text item expands to this exact professional-translator instruction.
      // Do not add `<bos>` here; the tokenizer's post-processing supplies it.
      return "<start_of_turn>user\nYou are a professional \(sourceName) (\(source)) to \(targetName) (\(target)) translator. Your goal is to accurately convey the meaning and nuances of the original \(sourceName) text while adhering to \(targetName) grammar, vocabulary, and cultural sensitivities.\nProduce only the \(targetName) translation, without any additional explanations or commentary. Please translate the following \(sourceName) text into \(targetName):\n\n\n\(sourceText)<end_of_turn>\n<start_of_turn>model\n"
    case .hy18B:
      return "<｜hy_begin▁of▁sentence｜><｜hy_User｜>Translate the following text into \(targetName). Note that you should only output the translated result without any additional explanation:\n\n\(sourceText)<｜hy_Assistant｜>"
    case .hy7B:
      return "<|startoftext|>Translate the following text into \(targetName). Note that you should only output the translated result without any additional explanation:\n\n\(sourceText)<|extra_0|>"
    }
  }

  private func normalizedLanguageCode(_ code: String) -> String {
    code.trimmingCharacters(in: .whitespacesAndNewlines)
      .replacingOccurrences(of: "_", with: "-")
  }

  private func languageName(_ code: String) -> String {
    switch code.lowercased() {
    case "en": "English"
    case "ko": "Korean"
    case "zh", "zh-cn", "zh-tw": "Chinese"
    case "ja": "Japanese"
    case "es": "Spanish"
    case "fr": "French"
    case "de": "German"
    case "it": "Italian"
    case "pt": "Portuguese"
    case "ru": "Russian"
    case "ar": "Arabic"
    default: code
    }
  }

  private func maximumInputTokens(for model: LocalModel) -> Int {
    switch model {
    case .translateGemma4B, .translateGemma12B:
      // TranslateGemma's published translation contract is 2K input tokens.
      return 2_048
    default:
      return 8_192
    }
  }

  /// Use tokenizer counts rather than UTF-8 bytes. The source-to-target ratio
  /// is intentionally generous for Korean and other scripts, while the cap
  /// remains bounded so a malformed page block cannot reserve unbounded work.
  private func outputTokenBudget(
    sourceTokenCount: Int,
    promptTokenCount: Int,
    model: LocalModel
  ) -> Int {
    let contextLimit = model == .translateGemma4B || model == .translateGemma12B ? 4_096 : 8_192
    let desired = max(96, min(768, sourceTokenCount * 2 + 64))
    let available = max(96, contextLimit - promptTokenCount - 16)
    return min(desired, available)
  }

  private func normalizedTranslation(_ output: String, model: LocalModel) -> String {
    var result = output
      .replacingOccurrences(of: "\r\n", with: "\n")
      .replacingOccurrences(of: "\r", with: "\n")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if result.first == "\u{FEFF}" { result.removeFirst() }

    // Some converted tokenizers decode an end marker as ordinary text even
    // when generation reports a normal stop. Strip it only at the boundary;
    // an interior control token is rejected by the script-level interpreter.
    let stopMarkers: [String]
    switch model {
    case .translateGemma4B, .translateGemma12B:
      stopMarkers = ["<end_of_turn>", "<eos>"]
    case .hy18B:
      stopMarkers = ["<｜hy_place▁holder▁no▁2｜>"]
    case .hy7B:
      stopMarkers = ["<|eos|>", "<|extra_5|>"]
    default:
      stopMarkers = ["<turn|>", "<|turn>", "<|eos|>"]
    }
    for marker in stopMarkers where result.hasSuffix(marker) {
      result = String(result.dropLast(marker.count)).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    guard !result.isEmpty, !result.contains("\0") else { return "" }
    return result
  }

  /// Korean is the default target and is especially easy for a small model to
  /// confuse with Chinese. Keep this gate conservative: short labels, names,
  /// numbers, and punctuation are allowed through, while a substantial Korean
  /// paragraph must contain Hangul before it can reach the page or cache.
  private func targetLanguageLooksPlausible(_ text: String, target: String) -> Bool {
    let normalizedTarget = target.lowercased().replacingOccurrences(of: "_", with: "-")
    guard normalizedTarget == "ko" || normalizedTarget.hasPrefix("ko-") else { return true }

    let letters = text.unicodeScalars.filter { CharacterSet.letters.contains($0) }
    guard letters.count >= 12 else { return true }
    return text.unicodeScalars.contains { scalar in
      let value = scalar.value
      return (0x1100...0x11FF).contains(value) ||
        (0xA960...0xA97F).contains(value) ||
        (0xAC00...0xD7FF).contains(value)
    }
  }

  /// Keep model-facing input and output deliberately text-only. Page blocks
  /// can contain anchor markup, and small models often echo it or invent a
  /// JSON/code-fence wrapper even when asked for a translation.
  private func plainText(_ raw: String) -> String {
    var text = raw.replacingOccurrences(
      of: #"</?[A-Za-z][^>]*>"#,
      with: " ",
      options: .regularExpression
    )
    let entities = [
      "&nbsp;": " ",
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": "\"",
      "&#39;": "'",
      "&#x27;": "'",
    ]
    for (entity, value) in entities {
      text = text.replacingOccurrences(of: entity, with: value)
    }
    let lines = text.components(separatedBy: .newlines).map {
      $0.replacingOccurrences(of: #"[ \t]+"#, with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespaces)
    }
    return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func generate(container: ModelContainer, prompt: String, maxTokens: Int, model: LocalModel) async throws -> (text: String, stopReason: GenerateStopReason) {
    // `prepare(input:)` applies the model's chat template through Jinja.
    // Direct tokenization is intentional: prompts above already include the
    // required local-model turn markers and never contact a remote service.
    let input = LMInput(tokens: MLXArray(await container.encode(prompt)))
    return try await container.perform(nonSendable: input) { context, input in
      let iterator = try TokenIterator(input: input, model: context.model, processor: nil, sampler: ArgMaxSampler(), maxTokens: maxTokens)
      var generationConfiguration = context.configuration
      if model == .translateGemma4B || model == .translateGemma12B {
        // The pinned TranslateGemma bundle declares `<end_of_turn>` in its
        // tokenizer but omits it from generation_config.json. The model then
        // runs to the token cap even after producing a complete translation.
        generationConfiguration.extraEOSTokens.insert("<end_of_turn>")
      }
      let (stream, task) = generateTask(promptTokenCount: input.text.tokens.size, modelConfiguration: generationConfiguration, tokenizer: context.tokenizer, iterator: iterator)
      var output = ""
      var completion: GenerateCompletionInfo?
      for await event in stream {
        switch event {
        case .chunk(let text): output.append(text)
        case .info(let info): completion = info
        case .toolCall: break
        }
      }
      await task.value
      guard let completion else { throw HostError.invalidOutput }
      return (output, completion.stopReason)
    }
  }
}

private enum HostError: LocalizedError { case invalidRequest, modelsNotFound, invalidOutput, inputTooLong
  var code: String { switch self { case .invalidRequest: "invalid_request"; case .modelsNotFound: "models_not_found"; case .invalidOutput: "invalid_output"; case .inputTooLong: "input_too_long" } }
  var errorDescription: String? { switch self { case .invalidRequest: "Invalid local translation request."; case .modelsNotFound: "One or more required local model files are missing."; case .invalidOutput: "The local model returned an invalid translation."; case .inputTooLong: "The local text block exceeds this model's input limit." } }
}

@main struct B3rysLocalMLXHost {
  static func main() async {
    let protocolOut = FileHandle(fileDescriptor: dup(STDOUT_FILENO), closeOnDealloc: true)
    _ = dup2(STDERR_FILENO, STDOUT_FILENO)
    await B3rysModelRegistration.registerModelTypes()
    let engine = Engine()
    while let data = readFrame() {
      guard let request = try? JSONDecoder().decode(Request.self, from: data) else { return }
      if request.type == "shutdown" { write(Response(requestId: request.requestId, translations: [], error: nil), to: protocolOut); return }
      guard request.type == "translate" else { write(Response(requestId: request.requestId, translations: nil, error: .init(code: "invalid_request", message: "Unknown request.")), to: protocolOut); continue }
      do { write(Response(requestId: request.requestId, translations: try await engine.translate(request), error: nil), to: protocolOut) }
      catch {
        let hostError = error as? HostError
        write(Response(requestId: request.requestId, translations: nil, error: .init(code: hostError?.code ?? "runtime_error", message: error.localizedDescription)), to: protocolOut)
      }
    }
  }
}

private func readFrame() -> Data? { let header = FileHandle.standardInput.readData(ofLength: 4); guard header.count == 4 else { return nil }; let length = header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }; guard length > 0, length <= maximumMessageBytes else { return nil }; let data = FileHandle.standardInput.readData(ofLength: Int(length)); return data.count == Int(length) ? data : nil }
private func write(_ response: Response, to handle: FileHandle) { guard let data = try? JSONEncoder().encode(response), data.count <= maximumMessageBytes else { return }; var length = UInt32(data.count); handle.write(Data(bytes: &length, count: 4)); handle.write(data) }
