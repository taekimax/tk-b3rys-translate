// swift-tools-version: 6.2
import PackageDescription

let package = Package(
  name: "B3rysLocalMLXHost",
  platforms: [.macOS(.v14)],
  products: [.executable(name: "b3rys-local-mlx-host", targets: ["B3rysLocalMLXHost"])],
  dependencies: [
    .package(url: "https://github.com/ml-explore/mlx-swift-lm.git", exact: "3.31.4"),
    .package(url: "https://github.com/ml-explore/mlx-swift.git", exact: "0.31.6"),
    .package(url: "https://github.com/huggingface/swift-transformers.git", exact: "1.3.3"),
  ],
  targets: [.executableTarget(name: "B3rysLocalMLXHost", dependencies: [
    .product(name: "MLX", package: "mlx-swift"),
    .product(name: "MLXNN", package: "mlx-swift"),
    .product(name: "MLXLLM", package: "mlx-swift-lm"),
    .product(name: "MLXLMCommon", package: "mlx-swift-lm"),
    .product(name: "MLXHuggingFace", package: "mlx-swift-lm"),
    .product(name: "Hub", package: "swift-transformers"),
    .product(name: "Tokenizers", package: "swift-transformers"),
  ])]
)
