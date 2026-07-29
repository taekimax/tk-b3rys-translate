import Darwin
import Foundation
import MLX
import MLXHuggingFace
import MLXLLM
import MLXLMCommon
import Tokenizers

private let maximumMessageBytes = 8 * 1024 * 1024

private enum LocalModel: String, Codable, CaseIterable {
  case gemma4E4B = "gemma4-e4b-q4"
  case gemma4_12B = "gemma4-12b-q4"
  case translateGemma4B = "translategemma-4b-it-q4"
  case translateGemma12B = "translategemma-12b-it-q4"
  case hy18B = "hy-mt2-1.8b-q4"
  case hy7B = "hy-mt2-7b-q4"

  var directory: String {
    switch self {
    case .gemma4E4B: "gemma-4-e4b-it-4bit"
    case .gemma4_12B: "gemma-4-12B-it-4bit"
    case .translateGemma4B: "translategemma-4b-it-4bit"
    case .translateGemma12B: "translategemma-12b-it-4bit"
    case .hy18B: "Hy-MT2-1.8B-4bit"
    case .hy7B: "Hy-MT2-7B-4bit"
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
      let prompt = promptFor(item: item, request: request, model: model)
      let generated = try await generate(container: container, prompt: prompt, maxTokens: max(128, min(1024, item.text.utf8.count * 2)))
      let text = generated.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !text.isEmpty, text.utf8.count <= maximumMessageBytes else { throw HostError.invalidOutput }
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

  private func promptFor(item: TranslationItem, request: Request, model: LocalModel) -> String {
    let source = request.sourceLang ?? "en", target = request.targetLang ?? "ko"
    if model == .translateGemma4B || model == .translateGemma12B {
      // The bundled TranslateGemma tokenizer owns the template. Its structured
      // input is assembled by MLX's tokenizer loader from this unambiguous text.
      return "Translate the following text from \(source) to \(target). Output only the translation.\n\n\(item.text)"
    }
    let context = (request.subtitleContext ?? []).suffix(3).map { "\($0.original) => \($0.translated)" }.joined(separator: "\n")
    return "You are a translation engine. Translate only the input from \(source) to \(target). Preserve meaning and formatting. Output only the translation.\n\nContext (reference only):\n\(context)\n\nInput:\n\(item.text)"
  }

  private func generate(container: ModelContainer, prompt: String, maxTokens: Int) async throws -> String {
    let input = try await container.prepare(input: UserInput(prompt: prompt))
    return try await container.perform(nonSendable: input) { context, input in
      let iterator = try TokenIterator(input: input, model: context.model, processor: nil, sampler: ArgMaxSampler(), maxTokens: maxTokens)
      let (stream, task) = generateTask(promptTokenCount: input.text.tokens.size, modelConfiguration: context.configuration, tokenizer: context.tokenizer, iterator: iterator)
      var output = ""
      for await event in stream {
        if case .chunk(let text) = event { output.append(text) }
      }
      await task.value
      return output
    }
  }
}

private enum HostError: LocalizedError { case invalidRequest, modelsNotFound, invalidOutput
  var errorDescription: String? { switch self { case .invalidRequest: "Invalid local translation request."; case .modelsNotFound: "One or more required local model files are missing."; case .invalidOutput: "The local model returned an invalid translation." } }
}

@main struct B3rysLocalMLXHost {
  static func main() async {
    let protocolOut = FileHandle(fileDescriptor: dup(STDOUT_FILENO), closeOnDealloc: true)
    _ = dup2(STDERR_FILENO, STDOUT_FILENO)
    let engine = Engine()
    while let data = readFrame() {
      guard let request = try? JSONDecoder().decode(Request.self, from: data) else { return }
      if request.type == "shutdown" { write(Response(requestId: request.requestId, translations: [], error: nil), to: protocolOut); return }
      guard request.type == "translate" else { write(Response(requestId: request.requestId, translations: nil, error: .init(code: "invalid_request", message: "Unknown request.")), to: protocolOut); continue }
      do { write(Response(requestId: request.requestId, translations: try await engine.translate(request), error: nil), to: protocolOut) }
      catch { write(Response(requestId: request.requestId, translations: nil, error: .init(code: "local_error", message: error.localizedDescription)), to: protocolOut) }
    }
  }
}

private func readFrame() -> Data? { let header = FileHandle.standardInput.readData(ofLength: 4); guard header.count == 4 else { return nil }; let length = header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }; guard length > 0, length <= maximumMessageBytes else { return nil }; let data = FileHandle.standardInput.readData(ofLength: Int(length)); return data.count == Int(length) ? data : nil }
private func write(_ response: Response, to handle: FileHandle) { guard let data = try? JSONEncoder().encode(response), data.count <= maximumMessageBytes else { return }; var length = UInt32(data.count); handle.write(Data(bytes: &length, count: 4)); handle.write(data) }
