# ipcs-be

A set of standardized types and functions for interacting with other Minecraft Bedrock Edition add-ons.

## Logging

Warnings (invalid hello packets, errors thrown by listeners) are wrapped in a `DEBUG:` label. Strip them in
release builds by dropping the label in your bundler, e.g. esbuild `dropLabels: ["DEBUG"]`.

## Contributing

Feel free to raise an issue or submit a pull request if you have any improvements or features to suggest.

## License

This project is licensed under the MIT License.