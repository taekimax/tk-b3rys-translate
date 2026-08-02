import Darwin
import Foundation
import Hub
import MLX
import MLXHuggingFace
import MLXLLM
import MLXLMCommon
import Tokenizers

private let maximumMessageBytes = 8 * 1024 * 1024

/// Records only operational metadata for failed local translations. Page text
/// and model output are deliberately excluded: the log exists to distinguish
/// generation cutoffs from validation failures without retaining browsing
/// content on disk.
private enum TranslationDiagnostics {
  private static let directoryName = "web-translate/diagnostics"
  private static let fileName = "translation-failures.jsonl"
  private static let maximumBytes = 256 * 1024
  private static let lock = NSLock()

  private struct Entry: Encodable {
    let timestamp: String
    let modelId: String
    let reason: String
    let sourceCharacters: Int
    let sourceTokens: Int
    let promptTokens: Int
    let outputTokenBudget: Int
    let outputCharacters: Int
    let outputBytes: Int
    let stopReason: String
  }

  static func record(
    model: LocalModel,
    reason: String,
    sourceCharacters: Int,
    sourceTokens: Int,
    promptTokens: Int,
    outputTokenBudget: Int,
    output: String,
    stopReason: GenerateStopReason
  ) {
    let entry = Entry(
      timestamp: ISO8601DateFormatter().string(from: Date()),
      modelId: model.rawValue,
      reason: reason,
      sourceCharacters: sourceCharacters,
      sourceTokens: sourceTokens,
      promptTokens: promptTokens,
      outputTokenBudget: outputTokenBudget,
      outputCharacters: output.count,
      outputBytes: output.utf8.count,
      stopReason: String(describing: stopReason)
    )
    guard let encoded = try? JSONEncoder().encode(entry) else { return }

    lock.lock()
    defer { lock.unlock() }
    do {
      let root = try FileManager.default.url(
        for: .applicationSupportDirectory,
        in: .userDomainMask,
        appropriateFor: nil,
        create: true
      ).appending(path: directoryName, directoryHint: .isDirectory)
      try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
      let file = root.appending(path: fileName)
      if let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
        size + encoded.count + 1 > maximumBytes {
        let previous = root.appending(path: "translation-failures.previous.jsonl")
        try? FileManager.default.removeItem(at: previous)
        try FileManager.default.moveItem(at: file, to: previous)
      }
      if !FileManager.default.fileExists(atPath: file.path) {
        FileManager.default.createFile(atPath: file.path, contents: nil)
      }
      let handle = try FileHandle(forWritingTo: file)
      try handle.seekToEnd()
      try handle.write(contentsOf: encoded + Data([0x0A]))
      try handle.close()
    } catch {
      // Diagnostics must never change the translation result.
    }
  }
}

private enum WebTranslateModelRegistration {
  /// MLX Swift supports the TranslateGemma architecture directly. Hy-MT2 uses
  /// its own Hunyuan architecture, so register the local implementation before
  /// the factory examines a downloaded Hy model configuration.
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
  case translateGemma4B = "translategemma-4b-it-q4"
  case translateGemma12B = "translategemma-12b-it-q4"
  case hy18B = "hy-mt2-1.8b-q4"
  case hy7B = "hy-mt2-7b-q4"

  var directory: String {
    switch self {
    case .translateGemma4B: "translategemma-4b-it-q4/5788ec08c047f3f2e17808101b8d9566ac930d58"
    case .translateGemma12B: "translategemma-12b-it-q4/f3dcfd54df14672fbcf0731086fb47a797a943ae"
    case .hy18B: "hy-mt2-1.8b-q4/e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912"
    case .hy7B: "hy-mt2-7b-q4/9b7204bdb161490a8ce49ce607c1310cc3fd03ad"
    }
  }

  var repository: String {
    switch self {
    case .translateGemma4B: "mlx-community/translategemma-4b-it-4bit"
    case .translateGemma12B: "mlx-community/translategemma-12b-it-4bit"
    case .hy18B: "mlx-community/Hy-MT2-1.8B-4bit"
    case .hy7B: "mlx-community/Hy-MT2-7B-4bit"
    }
  }

  var revision: String {
    switch self {
    case .translateGemma4B: "5788ec08c047f3f2e17808101b8d9566ac930d58"
    case .translateGemma12B: "f3dcfd54df14672fbcf0731086fb47a797a943ae"
    case .hy18B: "e5c6fe56c7b3bc77fae5ae92db31f2178f1e6912"
    case .hy7B: "9b7204bdb161490a8ce49ce607c1310cc3fd03ad"
    }
  }

  var requiresTermsAcceptance: Bool {
    switch self {
    case .translateGemma4B, .translateGemma12B: true
    case .hy18B, .hy7B: false
    }
  }
}

/// A runtime policy is intentionally narrower than a model's advertised
/// context window: this host runs on a user's Mac alongside Chrome. The output
/// ceiling is never inferred from source length, though. A translation can be
/// substantially longer than its source (especially into Korean), and a
/// source-ratio cap turns an otherwise healthy generation into a false error.
private struct TranslationGenerationPolicy {
  enum Decoding {
    case greedy
    case sampled(temperature: Float, topP: Float, topK: Int, repetitionPenalty: Float?)
  }

  let maximumInputTokens: Int
  let runtimeContextTokens: Int
  let maximumOutputTokens: Int
  let decoding: Decoding

  func outputTokenBudget(promptTokenCount: Int) -> Int {
    // Reserve a small margin for the terminal token and generation machinery.
    max(1, min(maximumOutputTokens, runtimeContextTokens - promptTokenCount - 16))
  }

  func parameters(maxTokens: Int) -> GenerateParameters {
    switch decoding {
    case .greedy:
      return GenerateParameters(maxTokens: maxTokens, temperature: 0)
    case let .sampled(temperature, topP, topK, repetitionPenalty):
      return GenerateParameters(
        maxTokens: maxTokens,
        temperature: temperature,
        topP: topP,
        topK: topK,
        repetitionPenalty: repetitionPenalty
      )
    }
  }
}

private extension LocalModel {
  var translationGenerationPolicy: TranslationGenerationPolicy {
    switch self {
    case .hy18B, .hy7B:
      // Tencent's Hy-MT2 1.8B/7B inference guide: temperature 0.7,
      // top-p 0.6, top-k 20, repetition penalty 1.05, max_tokens 4096.
      return .init(
        maximumInputTokens: 4_096,
        runtimeContextTokens: 8_192,
        maximumOutputTokens: 4_096,
        decoding: .sampled(temperature: 0.7, topP: 0.6, topK: 20, repetitionPenalty: 1.05)
      )
    case .translateGemma4B, .translateGemma12B:
      // Google specifies a 2K-token text-input contract and demonstrates
      // deterministic (`do_sample=False`) translation. Reserve a matching
      // 2K output window instead of estimating it from source token count.
      return .init(
        maximumInputTokens: 2_048,
        runtimeContextTokens: 4_096,
        maximumOutputTokens: 2_048,
        decoding: .greedy
      )
    }
  }
}

private struct TranslationItem: Codable { let id: String; let text: String }
private struct ContextItem: Codable { let original: String; let translated: String }
private struct Request: Codable {
  let type: String; let requestId: String; let modelId: String?
  let paragraphs: [TranslationItem]?; let mode: String?; let subtitleContext: [ContextItem]?
  let sourceLang: String?; let targetLang: String?
}
private struct ErrorValue: Codable { let code: String; let message: String }
private struct Response: Codable, Sendable {
  let requestId: String; let translations: [Translation]?; let error: ErrorValue?
  let modelRoot: String?; let models: [ModelStatus]?
  let event: String?; let download: DownloadProgress?
  struct Translation: Codable, Sendable { let id: String; let translatedText: String }
  struct ModelStatus: Codable, Sendable {
    let id: String; let path: String; let ready: Bool; let missingFiles: [String]
  }
  struct DownloadProgress: Codable, Sendable {
    let modelId: String; let fraction: Double; let bytesPerSecond: Double?

    init(modelId: String, fraction: Double, bytesPerSecond: Double? = nil) {
      self.modelId = modelId
      self.fraction = fraction
      self.bytesPerSecond = bytesPerSecond
    }
  }
  init(
    requestId: String,
    translations: [Translation]?,
    error: ErrorValue?,
    modelRoot: String?,
    models: [ModelStatus]?,
    event: String? = nil,
    download: DownloadProgress? = nil
  ) {
    self.requestId = requestId
    self.translations = translations
    self.error = error
    self.modelRoot = modelRoot
    self.models = models
    self.event = event
    self.download = download
  }
}

private struct PreparedModel {
  let path: URL
  let downloaded: Bool
}

private final class Engine {
  private var resident: (model: LocalModel, path: URL, container: ModelContainer)?

  func translate(
    _ request: Request,
    progressHandler: @Sendable @escaping (Response.DownloadProgress) -> Void
  ) async throws -> [Response.Translation] {
    guard let modelId = request.modelId,
      let model = LocalModel(rawValue: modelId),
      let paragraphs = request.paragraphs,
      !paragraphs.isEmpty
    else { throw HostError.invalidRequest }
    let root = modelRoot()
    let prepared = try await ensureModel(root: root, model: model, progressHandler: progressHandler)
    let path = prepared.path
    let container: ModelContainer
    if let resident, resident.model == model, resident.path == path { container = resident.container }
    else {
      self.resident = nil
      Memory.clearCache()
      do {
        container = try await LLMModelFactory.shared.loadContainer(from: path, using: #huggingFaceTokenizerLoader())
      } catch {
        if prepared.downloaded {
          do {
            try quarantineModel(at: path, root: root, model: model)
          } catch {
            // A freshly downloaded model must never remain at the canonical
            // path after a load failure, otherwise the next request skips the
            // download and retries the same broken snapshot forever.
            try? FileManager.default.removeItem(at: path)
            throw HostError.modelDownloadFailed(
              "downloaded model failed to load and could not be quarantined: \(error.localizedDescription)"
            )
          }
        }
        throw error
      }
      self.resident = (model, path, container)
    }
    var results: [Response.Translation] = []
    for item in paragraphs {
      try Task.checkCancellation()
      let policy = model.translationGenerationPolicy
      let prompt = formattedPromptFor(item: item, request: request, model: model)
      let promptTokenCount = await container.encode(prompt).count
      guard promptTokenCount <= policy.maximumInputTokens else {
        throw HostError.inputTooLong
      }
      let sourceText = plainText(item.text)
      let sourceTokenCount = await container.encode(sourceText).count
      let tokenBudget = policy.outputTokenBudget(promptTokenCount: promptTokenCount)
      let generated = try await generate(
        container: container,
        prompt: prompt,
        maxTokens: tokenBudget,
        model: model
      )
      // A max-token cutoff can look like a valid translation while ending in
      // the middle of a sentence. Never inject or cache such output.
      guard case .stop = generated.stopReason else {
        TranslationDiagnostics.record(
          model: model,
          reason: "non_stop_generation",
          sourceCharacters: sourceText.count,
          sourceTokens: sourceTokenCount,
          promptTokens: promptTokenCount,
          outputTokenBudget: tokenBudget,
          output: generated.text,
          stopReason: generated.stopReason
        )
        throw HostError.invalidOutput
      }
      let text = normalizedTranslation(generated.text, model: model)
      let failureReason: String?
      if text.isEmpty {
        failureReason = "empty_normalized_output"
      } else if text.utf8.count > maximumMessageBytes {
        failureReason = "output_too_large"
      } else if !targetLanguageLooksPlausible(text, target: request.targetLang ?? "ko") {
        failureReason = "wrong_target_script"
      } else {
        failureReason = nil
      }
      if let failureReason {
        TranslationDiagnostics.record(
          model: model,
          reason: failureReason,
          sourceCharacters: sourceText.count,
          sourceTokens: sourceTokenCount,
          promptTokens: promptTokenCount,
          outputTokenBudget: tokenBudget,
          output: generated.text,
          stopReason: generated.stopReason
        )
        throw HostError.invalidOutput
      }
      results.append(.init(id: item.id, translatedText: text))
      Memory.clearCache()
    }
    return results
  }

  /// Popup-initiated installation fetches and validates one pinned bundle.
  /// It deliberately does not load MLX or translate text as a side effect.
  func download(
    _ model: LocalModel,
    progressHandler: @Sendable @escaping (Response.DownloadProgress) -> Void
  ) async throws {
    _ = try await ensureModel(root: modelRoot(), model: model, progressHandler: progressHandler)
  }

  func modelRoot() -> URL {
    let environment = ProcessInfo.processInfo.environment
    for key in ["WEB_TRANSLATE_MODEL_ROOT", "B3RYS_MODEL_ROOT"] {
      if let configured = environment[key], !configured.isEmpty {
        return URL(filePath: configured, directoryHint: .isDirectory).standardizedFileURL
      }
    }
    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).resolvingSymlinksInPath()
    var current = executable.deletingLastPathComponent()
    for _ in 0..<8 {
      let candidate = current.appending(path: ".local-models", directoryHint: .isDirectory)
      if FileManager.default.fileExists(atPath: candidate.path) { return candidate }
      current.deleteLastPathComponent()
    }
    let preferred = FileManager.default.homeDirectoryForCurrentUser
      .appending(path: "Library/Application Support/web-translate/models", directoryHint: .isDirectory)
      .standardizedFileURL
    let legacy = FileManager.default.homeDirectoryForCurrentUser
      .appending(path: "Library/Application Support/b3rys-translate/models", directoryHint: .isDirectory)
      .standardizedFileURL
    if !FileManager.default.fileExists(atPath: preferred.path),
       FileManager.default.fileExists(atPath: legacy.path) {
      return legacy
    }
    return preferred
  }

  private func missingFiles(at directory: URL) -> [String] {
    var missingFiles: [String] = []
    for required in ["config.json", "tokenizer.json"] {
      if !validJSONFile(at: directory.appending(path: required), in: directory) {
        missingFiles.append(required)
      }
    }
    let index = directory.appending(path: "model.safetensors.index.json")
    if pathExistsOrSymlink(at: index) {
      guard validJSONFile(at: index, in: directory),
      let data = try? Data(contentsOf: index),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let weightMap = object["weight_map"] as? [String: Any]
      else {
        missingFiles.append("model.safetensors.index.json")
        return missingFiles
      }
      let shards = Set(weightMap.values.compactMap { $0 as? String })
      if shards.isEmpty { missingFiles.append("model.safetensors.index.json") }
      for shard in shards.sorted() {
        guard isSafeRelativePath(shard),
          let shardURL = safeFileURL(at: directory.appending(path: shard), in: directory),
          isRegularNonEmptyFile(at: shardURL)
        else {
          missingFiles.append(shard)
          continue
        }
      }
    } else if safeFileURL(at: directory.appending(path: "model.safetensors"), in: directory)
      .map({ !isRegularNonEmptyFile(at: $0) }) ?? true
    {
      missingFiles.append("model.safetensors")
    }
    return missingFiles
  }

  private func validJSONFile(at url: URL, in directory: URL) -> Bool {
    guard let safeURL = safeFileURL(at: url, in: directory),
      isRegularNonEmptyFile(at: safeURL),
      let data = try? Data(contentsOf: safeURL)
    else { return false }
    return (try? JSONSerialization.jsonObject(with: data)) != nil
  }

  private func isRegularNonEmptyFile(at url: URL) -> Bool {
    var info = stat()
    guard lstat(url.path, &info) == 0 else { return false }
    return (info.st_mode & S_IFMT) == S_IFREG && info.st_size > 0
  }

  private func isContained(_ url: URL, in root: URL) -> Bool {
    let resolvedRoot = root.resolvingSymlinksInPath().standardizedFileURL.path
    let resolvedURL = url.resolvingSymlinksInPath().standardizedFileURL.path
    return resolvedURL.hasPrefix(resolvedRoot + "/")
  }

  private func pathExistsOrSymlink(at url: URL) -> Bool {
    var info = stat()
    return lstat(url.path, &info) == 0
  }

  private func isSafeRelativePath(_ path: String) -> Bool {
    !path.isEmpty && !path.hasPrefix("/") &&
      !path.split(separator: "/", omittingEmptySubsequences: false).contains("..")
  }

  private func safeFileURL(at url: URL, in directory: URL) -> URL? {
    guard isContained(url, in: directory), !isSymbolicLink(at: url) else { return nil }
    return url
  }

  private func safeModelDirectory(root: URL, model: LocalModel) -> URL? {
    let root = root.resolvingSymlinksInPath().standardizedFileURL
    let directory = root.appending(path: model.directory, directoryHint: .isDirectory)
    guard directory.standardizedFileURL.path.hasPrefix(root.path + "/"), isContained(directory, in: root) else { return nil }
    var info = stat()
    if lstat(directory.path, &info) == 0, (info.st_mode & S_IFMT) == S_IFLNK { return nil }
    return directory
  }

  private func ensureModel(
    root: URL,
    model: LocalModel,
    progressHandler: @Sendable @escaping (Response.DownloadProgress) -> Void
  ) async throws -> PreparedModel {
    let root = root.resolvingSymlinksInPath()
    guard let destination = safeModelDirectory(root: root, model: model) else { throw HostError.modelsNotFound }
    if missingFiles(at: destination).isEmpty {
      try writeModelTermsNotice(at: destination, model: model)
      return .init(path: destination, downloaded: false)
    }

    let stagingRoot = root.appending(path: ".downloads", directoryHint: .isDirectory)
    do {
      try makeAuxiliaryDirectory(stagingRoot, within: root)
      let hub = HubApi(downloadBase: stagingRoot, cache: nil, endpoint: "https://huggingface.co")
      let snapshot = try await hub.snapshot(
        from: Hub.Repo(id: model.repository),
        revision: model.revision,
        matching: ["*.json", "*.jinja", "*.safetensors", "*.txt", "*.model", "*.vocab", "*.merges"]
      ) { progress, bytesPerSecond in
        progressHandler(
          .init(
            modelId: model.rawValue,
            fraction: min(max(progress.fractionCompleted, 0), 1),
            bytesPerSecond: bytesPerSecond
          )
        )
      }
      let staged = snapshot.resolvingSymlinksInPath()
      guard isContained(staged, in: stagingRoot), !isSymbolicLink(at: staged), missingFiles(at: staged).isEmpty else {
        throw HostError.modelDownloadFailed("download completed without all required model files")
      }
      try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)
      try promote(staged: staged, to: destination)
      try writeModelTermsNotice(at: destination, model: model)
      progressHandler(.init(modelId: model.rawValue, fraction: 1))
      return .init(path: destination, downloaded: true)
    } catch let error as HostError {
      throw error
    } catch {
      throw HostError.modelDownloadFailed(error.localizedDescription)
    }
  }

  private func writeModelTermsNotice(at directory: URL, model: LocalModel) throws {
    guard model.requiresTermsAcceptance else { return }
    let notice = "Gemma is provided under and subject to the Gemma Terms of Use found at ai.google.dev/gemma/terms\n"
    let destination = directory.appending(path: "GEMMA_TERMS_NOTICE.txt")
    try Data(notice.utf8).write(to: destination, options: .atomic)
  }

  private func isSymbolicLink(at url: URL) -> Bool {
    var info = stat()
    return lstat(url.path, &info) == 0 && (info.st_mode & S_IFMT) == S_IFLNK
  }

  private func makeAuxiliaryDirectory(_ directory: URL, within root: URL) throws {
    guard directory.standardizedFileURL.path.hasPrefix(root.standardizedFileURL.path + "/"),
      !isSymbolicLink(at: directory)
    else { throw HostError.modelDownloadFailed("model storage contains an unsafe auxiliary path") }
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    guard isContained(directory, in: root), !isSymbolicLink(at: directory) else {
      throw HostError.modelDownloadFailed("model storage contains an unsafe auxiliary path")
    }
  }

  private func promote(staged: URL, to destination: URL) throws {
    let fileManager = FileManager.default
    let parent = destination.deletingLastPathComponent()
    var backup: URL?
    if fileManager.fileExists(atPath: destination.path) || isSymbolicLink(at: destination) {
      let candidate = parent.appending(
        path: ".\(destination.lastPathComponent).previous-\(UUID().uuidString)",
        directoryHint: .isDirectory
      )
      try fileManager.moveItem(at: destination, to: candidate)
      backup = candidate
    }
    do {
      try fileManager.moveItem(at: staged, to: destination)
      if let backup { try? fileManager.removeItem(at: backup) }
    } catch {
      if let backup, !fileManager.fileExists(atPath: destination.path) {
        try? fileManager.moveItem(at: backup, to: destination)
      }
      throw error
    }
  }

  private func quarantineModel(at path: URL, root: URL, model: LocalModel) throws {
    guard isContained(path, in: root), !isSymbolicLink(at: path) else {
      throw HostError.modelDownloadFailed("downloaded model path is unsafe")
    }
    let quarantineRoot = root.appending(path: ".invalid-models", directoryHint: .isDirectory)
    try makeAuxiliaryDirectory(quarantineRoot, within: root)
    let target = quarantineRoot.appending(
      path: "\(model.rawValue)-\(UUID().uuidString)",
      directoryHint: .isDirectory
    )
    try FileManager.default.moveItem(at: path, to: target)
  }

  func modelStatuses() -> [Response.ModelStatus] {
    let root = modelRoot().resolvingSymlinksInPath()
    return LocalModel.allCases.map { model in
      let path = root.appending(path: model.directory, directoryHint: .isDirectory)
      guard let directory = safeModelDirectory(root: root, model: model) else {
        return .init(id: model.rawValue, path: path.path, ready: false, missingFiles: ["model directory"])
      }
      let missingFiles = missingFiles(at: directory)
      return .init(id: model.rawValue, path: directory.path, ready: missingFiles.isEmpty, missingFiles: missingFiles)
    }
  }

  private func formattedPromptFor(item: TranslationItem, request: Request, model: LocalModel) -> String {
    let source = normalizedLanguageCode(request.sourceLang ?? "en")
    let target = normalizedLanguageCode(request.targetLang ?? "ko")
    let sourceText = plainText(item.text)
    let sourceName = languageName(source)
    let targetName = languageName(target)

    switch model {
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
      let parameters = model.translationGenerationPolicy.parameters(maxTokens: maxTokens)
      let iterator = try TokenIterator(
        input: input,
        model: context.model,
        processor: parameters.processor(),
        sampler: parameters.sampler(),
        maxTokens: maxTokens
      )
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

private enum HostError: LocalizedError { case invalidRequest, modelsNotFound, modelDownloadFailed(String), invalidOutput, inputTooLong
  var code: String { switch self { case .invalidRequest: "invalid_request"; case .modelsNotFound: "models_not_found"; case .modelDownloadFailed: "model_download_failed"; case .invalidOutput: "invalid_output"; case .inputTooLong: "input_too_long" } }
  var errorDescription: String? { switch self { case .invalidRequest: "Invalid local translation request."; case .modelsNotFound: "One or more required local model files are missing."; case let .modelDownloadFailed(reason): "The selected local model could not be downloaded: \(reason)"; case .invalidOutput: "The local model returned an invalid translation."; case .inputTooLong: "The local text block exceeds this model's input limit." } }
}

private final class NativeMessageWriter: @unchecked Sendable {
  private let handle: FileHandle
  private let lock = NSLock()
  private var terminal = false

  init(handle: FileHandle) {
    self.handle = handle
  }

  func send(_ response: Response, terminal: Bool) {
    lock.lock()
    defer { lock.unlock() }
    guard !self.terminal, let data = try? JSONEncoder().encode(response), data.count <= maximumMessageBytes else { return }
    var length = UInt32(data.count)
    var frame = Data(bytes: &length, count: 4)
    frame.append(data)
    handle.write(frame)
    if terminal { self.terminal = true }
  }

  func progress(requestId: String, _ progress: Response.DownloadProgress) {
    send(
      Response(
        requestId: requestId,
        translations: nil,
        error: nil,
        modelRoot: nil,
        models: nil,
        event: "model_download_progress",
        download: progress
      ),
      terminal: false
    )
  }
}

@main struct WebTranslateLocalMLXHost {
  static func main() async {
    let protocolOut = FileHandle(fileDescriptor: dup(STDOUT_FILENO), closeOnDealloc: true)
    _ = dup2(STDERR_FILENO, STDOUT_FILENO)
    await WebTranslateModelRegistration.registerModelTypes()
    let engine = Engine()
    while let data = readFrame() {
      guard let request = try? JSONDecoder().decode(Request.self, from: data) else { return }
      let writer = NativeMessageWriter(handle: protocolOut)
      if request.type == "shutdown" {
        writer.send(Response(requestId: request.requestId, translations: [], error: nil, modelRoot: nil, models: nil), terminal: true)
        return
      }
      if request.type == "model_status" {
        let root = engine.modelRoot().path
        writer.send(Response(requestId: request.requestId, translations: nil, error: nil, modelRoot: root, models: engine.modelStatuses()), terminal: true)
        continue
      }
      if request.type == "download_model" {
        guard let modelId = request.modelId, let model = LocalModel(rawValue: modelId) else {
          writer.send(Response(requestId: request.requestId, translations: nil, error: .init(code: "invalid_request", message: "A local model is required."), modelRoot: nil, models: nil), terminal: true)
          continue
        }
        let progressHandler: @Sendable (Response.DownloadProgress) -> Void = { progress in
          writer.progress(requestId: request.requestId, progress)
        }
        do {
          try await engine.download(model, progressHandler: progressHandler)
          let root = engine.modelRoot().path
          writer.send(Response(requestId: request.requestId, translations: nil, error: nil, modelRoot: root, models: engine.modelStatuses()), terminal: true)
        } catch {
          let hostError = error as? HostError
          writer.send(Response(requestId: request.requestId, translations: nil, error: .init(code: hostError?.code ?? "runtime_error", message: error.localizedDescription), modelRoot: nil, models: nil), terminal: true)
        }
        continue
      }
      guard request.type == "translate" else { writer.send(Response(requestId: request.requestId, translations: nil, error: .init(code: "invalid_request", message: "Unknown request."), modelRoot: nil, models: nil), terminal: true); continue }
      let progressHandler: @Sendable (Response.DownloadProgress) -> Void = { progress in
        writer.progress(requestId: request.requestId, progress)
      }
      do { writer.send(Response(requestId: request.requestId, translations: try await engine.translate(request, progressHandler: progressHandler), error: nil, modelRoot: nil, models: nil), terminal: true) }
      catch {
        let hostError = error as? HostError
        writer.send(Response(requestId: request.requestId, translations: nil, error: .init(code: hostError?.code ?? "runtime_error", message: error.localizedDescription), modelRoot: nil, models: nil), terminal: true)
      }
    }
  }
}

private func readFrame() -> Data? { let header = FileHandle.standardInput.readData(ofLength: 4); guard header.count == 4 else { return nil }; let length = header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }; guard length > 0, length <= maximumMessageBytes else { return nil }; let data = FileHandle.standardInput.readData(ofLength: Int(length)); return data.count == Int(length) ? data : nil }
