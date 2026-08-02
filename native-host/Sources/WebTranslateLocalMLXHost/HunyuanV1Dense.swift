import Foundation
import MLX
import MLXLLM
import MLXLMCommon
import MLXNN

/// Native MLX Swift port of `mlx_lm.models.hunyuan_v1_dense`.
///
/// The tensor hierarchy and module keys deliberately match the upstream
/// safetensors layout used by both Hy-MT2 1.8B and Hy-MT2 7B.
final class HunyuanV1DenseAttention: Module {
  let configuration: HunyuanV1DenseConfiguration
  let scale: Float

  @ModuleInfo(key: "q_proj") var queryProjection: Linear
  @ModuleInfo(key: "k_proj") var keyProjection: Linear
  @ModuleInfo(key: "v_proj") var valueProjection: Linear
  @ModuleInfo(key: "o_proj") var outputProjection: Linear

  @ModuleInfo(key: "query_layernorm") var queryLayerNorm: RMSNorm?
  @ModuleInfo(key: "key_layernorm") var keyLayerNorm: RMSNorm?

  let rope: HunyuanDynamicNTKAlphaRoPE

  init(_ configuration: HunyuanV1DenseConfiguration) {
    self.configuration = configuration

    let dimensions = configuration.hiddenSize
    let headDimensions = configuration.headDimensions
    self.scale = pow(Float(headDimensions), -0.5)

    _queryProjection.wrappedValue = Linear(
      dimensions,
      configuration.attentionHeads * headDimensions,
      bias: configuration.attentionBias
    )
    _keyProjection.wrappedValue = Linear(
      dimensions,
      configuration.keyValueHeads * headDimensions,
      bias: configuration.attentionBias
    )
    _valueProjection.wrappedValue = Linear(
      dimensions,
      configuration.keyValueHeads * headDimensions,
      bias: configuration.attentionBias
    )
    _outputProjection.wrappedValue = Linear(
      configuration.attentionHeads * headDimensions,
      dimensions,
      bias: configuration.attentionBias
    )

    if configuration.useQueryKeyNorm {
      _queryLayerNorm.wrappedValue = RMSNorm(
        dimensions: headDimensions,
        eps: configuration.rmsNormEpsilon
      )
      _keyLayerNorm.wrappedValue = RMSNorm(
        dimensions: headDimensions,
        eps: configuration.rmsNormEpsilon
      )
    }

    rope = HunyuanDynamicNTKAlphaRoPE(
      dimensions: headDimensions,
      base: configuration.ropeTheta,
      scalingAlpha: configuration.ropeScaling?.alpha ?? 1
    )
  }

  func callAsFunction(
    _ input: MLXArray,
    mask: MLXFast.ScaledDotProductAttentionMaskMode,
    cache: KVCache?
  ) -> MLXArray {
    let batchSize = input.dim(0)
    let sequenceLength = input.dim(1)
    let headDimensions = configuration.headDimensions

    var queries = queryProjection(input)
      .reshaped(
        batchSize,
        sequenceLength,
        configuration.attentionHeads,
        headDimensions
      )
      .transposed(0, 2, 1, 3)
    var keys = keyProjection(input)
      .reshaped(
        batchSize,
        sequenceLength,
        configuration.keyValueHeads,
        headDimensions
      )
      .transposed(0, 2, 1, 3)
    let values = valueProjection(input)
      .reshaped(
        batchSize,
        sequenceLength,
        configuration.keyValueHeads,
        headDimensions
      )
      .transposed(0, 2, 1, 3)

    let offset = cache?.ropeOffset
    queries = applyRotaryPosition(rope, to: queries, offset: offset)
    keys = applyRotaryPosition(rope, to: keys, offset: offset)

    // Upstream Hunyuan applies query/key normalization after RoPE.
    if let queryLayerNorm, let keyLayerNorm {
      queries = queryLayerNorm(queries)
      keys = keyLayerNorm(keys)
    }

    let output = attentionWithCacheUpdate(
      queries: queries,
      keys: keys,
      values: values,
      cache: cache,
      scale: scale,
      mask: mask
    )
    .transposed(0, 2, 1, 3)
    .reshaped(batchSize, sequenceLength, -1)

    return outputProjection(output)
  }
}

final class HunyuanDynamicNTKAlphaRoPE: Module, OffsetLayer, ArrayOffsetLayer {
  private final class FrequencyCache {
    let value: MLXArray

    init(_ value: MLXArray) {
      self.value = value
    }
  }

  let dimensions: Int
  // This is derived runtime state, not a checkpoint weight. MLX reflects all
  // direct MLXArray properties of Module subclasses, so retain it inside a
  // plain cache object rather than exposing a nonexistent safetensor key.
  private let frequencyCache: FrequencyCache

  init(dimensions: Int, base: Float = 10_000, scalingAlpha: Float = 1) {
    self.dimensions = dimensions

    let exponent = Float(dimensions) / Float(dimensions - 2)
    let scaledBase = base * pow(scalingAlpha, exponent)
    let indices = MLXArray(stride(from: 0, to: dimensions, by: 2))
    frequencyCache = FrequencyCache(
      MLX.pow(scaledBase, indices / Float(dimensions))
    )
  }

  func callAsFunction(_ input: MLXArray, offset: Int = 0) -> MLXArray {
    MLXFast.RoPE(
      input,
      dimensions: dimensions,
      traditional: false,
      base: nil,
      scale: 1,
      offset: offset,
      freqs: frequencyCache.value
    )
  }

  func callAsFunction(_ input: MLXArray, offset: MLXArray) -> MLXArray {
    MLXFast.RoPE(
      input,
      dimensions: dimensions,
      traditional: false,
      base: nil,
      scale: 1,
      offset: offset,
      freqs: frequencyCache.value
    )
  }
}

final class HunyuanV1DenseMLP: Module, UnaryLayer {
  @ModuleInfo(key: "gate_proj") var gateProjection: Linear
  @ModuleInfo(key: "down_proj") var downProjection: Linear
  @ModuleInfo(key: "up_proj") var upProjection: Linear

  init(_ configuration: HunyuanV1DenseConfiguration) {
    _gateProjection.wrappedValue = Linear(
      configuration.hiddenSize,
      configuration.intermediateSize,
      bias: false
    )
    _downProjection.wrappedValue = Linear(
      configuration.intermediateSize,
      configuration.hiddenSize,
      bias: false
    )
    _upProjection.wrappedValue = Linear(
      configuration.hiddenSize,
      configuration.intermediateSize,
      bias: false
    )
  }

  func callAsFunction(_ input: MLXArray) -> MLXArray {
    downProjection(silu(gateProjection(input)) * upProjection(input))
  }
}

final class HunyuanV1DenseTransformerBlock: Module {
  @ModuleInfo(key: "self_attn") var attention: HunyuanV1DenseAttention
  @ModuleInfo(key: "mlp") var mlp: HunyuanV1DenseMLP
  @ModuleInfo(key: "input_layernorm") var inputLayerNorm: RMSNorm
  @ModuleInfo(key: "post_attention_layernorm") var postAttentionLayerNorm: RMSNorm

  init(_ configuration: HunyuanV1DenseConfiguration) {
    _attention.wrappedValue = HunyuanV1DenseAttention(configuration)
    _mlp.wrappedValue = HunyuanV1DenseMLP(configuration)
    _inputLayerNorm.wrappedValue = RMSNorm(
      dimensions: configuration.hiddenSize,
      eps: configuration.rmsNormEpsilon
    )
    _postAttentionLayerNorm.wrappedValue = RMSNorm(
      dimensions: configuration.hiddenSize,
      eps: configuration.rmsNormEpsilon
    )
  }

  func callAsFunction(
    _ input: MLXArray,
    mask: MLXFast.ScaledDotProductAttentionMaskMode,
    cache: KVCache?
  ) -> MLXArray {
    var residual = attention(inputLayerNorm(input), mask: mask, cache: cache)
    let hidden = input + residual
    residual = mlp(postAttentionLayerNorm(hidden))
    return hidden + residual
  }
}

final class HunyuanV1DenseModelInner: Module {
  @ModuleInfo(key: "embed_tokens") var embedTokens: Embedding
  let layers: [HunyuanV1DenseTransformerBlock]
  let norm: RMSNorm

  init(_ configuration: HunyuanV1DenseConfiguration) {
    _embedTokens.wrappedValue = Embedding(
      embeddingCount: configuration.vocabularySize,
      dimensions: configuration.hiddenSize
    )
    layers = (0..<configuration.hiddenLayers).map { _ in
      HunyuanV1DenseTransformerBlock(configuration)
    }
    norm = RMSNorm(
      dimensions: configuration.hiddenSize,
      eps: configuration.rmsNormEpsilon
    )
  }

  func callAsFunction(_ inputs: MLXArray, cache: [KVCache]? = nil) -> MLXArray {
    var hidden = embedTokens(inputs)
    let mask = createAttentionMask(h: hidden, cache: cache?.first)

    for (index, layer) in layers.enumerated() {
      hidden = layer(hidden, mask: mask, cache: cache?[index])
    }

    return norm(hidden)
  }
}

final class HunyuanV1DenseModel: Module, LLMModel, KVCacheDimensionProvider {
  let vocabularySize: Int
  let kvHeads: [Int]
  let configuration: HunyuanV1DenseConfiguration
  let model: HunyuanV1DenseModelInner

  @ModuleInfo(key: "lm_head") var lmHead: Linear?

  init(_ configuration: HunyuanV1DenseConfiguration) {
    self.configuration = configuration
    vocabularySize = configuration.vocabularySize
    kvHeads = Array(
      repeating: configuration.keyValueHeads,
      count: configuration.hiddenLayers
    )
    model = HunyuanV1DenseModelInner(configuration)

    if !configuration.tieWordEmbeddings {
      _lmHead.wrappedValue = Linear(
        configuration.hiddenSize,
        configuration.vocabularySize,
        bias: false
      )
    }
  }

  func callAsFunction(_ inputs: MLXArray, cache: [KVCache]?) -> MLXArray {
    let output = model(inputs, cache: cache)
    if let lmHead {
      return lmHead(output)
    }
    return model.embedTokens.asLinear(output)
  }

  func sanitize(weights: [String: MLXArray]) -> [String: MLXArray] {
    var weights = weights.filter {
      !$0.key.contains("self_attn.rotary_emb.inv_freq")
    }
    if configuration.tieWordEmbeddings {
      weights["lm_head.weight"] = nil
    }
    return weights
  }
}

extension HunyuanV1DenseModel: LoRAModel {
  var loraLayers: [Module] {
    model.layers
  }
}

struct HunyuanV1DenseConfiguration: Codable, Sendable {
  struct RopeScaling: Codable, Sendable {
    let alpha: Float
    let factor: Float
    let type: String
  }

  let hiddenSize: Int
  let hiddenLayers: Int
  let intermediateSize: Int
  let attentionHeads: Int
  let keyValueHeads: Int
  let headDimensions: Int
  let rmsNormEpsilon: Float
  let vocabularySize: Int
  let maxPositionEmbeddings: Int
  let ropeTheta: Float
  let ropeScaling: RopeScaling?
  let attentionBias: Bool
  let useQueryKeyNorm: Bool
  let tieWordEmbeddings: Bool

  enum CodingKeys: String, CodingKey {
    case hiddenSize = "hidden_size"
    case hiddenLayers = "num_hidden_layers"
    case intermediateSize = "intermediate_size"
    case attentionHeads = "num_attention_heads"
    case keyValueHeads = "num_key_value_heads"
    case headDimensions = "head_dim"
    case rmsNormEpsilon = "rms_norm_eps"
    case vocabularySize = "vocab_size"
    case maxPositionEmbeddings = "max_position_embeddings"
    case ropeTheta = "rope_theta"
    case ropeScaling = "rope_scaling"
    case attentionBias = "attention_bias"
    case useQueryKeyNorm = "use_qk_norm"
    case tieWordEmbeddings = "tie_word_embeddings"
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    hiddenSize = try values.decode(Int.self, forKey: .hiddenSize)
    hiddenLayers = try values.decode(Int.self, forKey: .hiddenLayers)
    intermediateSize = try values.decode(Int.self, forKey: .intermediateSize)
    attentionHeads = try values.decode(Int.self, forKey: .attentionHeads)
    keyValueHeads =
      try values.decodeIfPresent(Int.self, forKey: .keyValueHeads)
      ?? attentionHeads
    headDimensions =
      try values.decodeIfPresent(Int.self, forKey: .headDimensions)
      ?? hiddenSize / attentionHeads
    rmsNormEpsilon = try values.decode(Float.self, forKey: .rmsNormEpsilon)
    vocabularySize = try values.decode(Int.self, forKey: .vocabularySize)
    maxPositionEmbeddings =
      try values.decodeIfPresent(Int.self, forKey: .maxPositionEmbeddings)
      ?? 32_768
    ropeTheta =
      try values.decodeIfPresent(Float.self, forKey: .ropeTheta)
      ?? 10_000
    ropeScaling = try values.decodeIfPresent(RopeScaling.self, forKey: .ropeScaling)
    attentionBias =
      try values.decodeIfPresent(Bool.self, forKey: .attentionBias)
      ?? false
    useQueryKeyNorm =
      try values.decodeIfPresent(Bool.self, forKey: .useQueryKeyNorm)
      ?? true
    tieWordEmbeddings =
      try values.decodeIfPresent(Bool.self, forKey: .tieWordEmbeddings)
      ?? false

    guard hiddenSize > 0,
      hiddenLayers > 0,
      intermediateSize > 0,
      attentionHeads > 0,
      keyValueHeads > 0,
      headDimensions > 2,
      headDimensions.isMultiple(of: 2),
      vocabularySize > 0,
      attentionHeads.isMultiple(of: keyValueHeads)
    else {
      throw DecodingError.dataCorrupted(
        .init(
          codingPath: decoder.codingPath,
          debugDescription: "Invalid Hunyuan V1 Dense dimensions"
        )
      )
    }
  }
}
