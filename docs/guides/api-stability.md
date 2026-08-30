# API stability

The generated API reference labels every public declaration with one of these
stability levels:

| Level | Compatibility intent |
| --- | --- |
| `stable` | Compatibility is intended across `0.x` minor releases. A breaking change requires an explicit release note and version boundary. |
| `beta` | Suitable for application use, but its shape may change while consumer evidence is gathered. |
| `experimental` | Evidence-gathering surface. Breaking changes are expected and it should not be a foundational dependency. |

`internal` code is not exported from package entrypoints and does not appear in
the public reference. Package versioning still follows semantic versioning; the
labels describe the narrower compatibility intent of individual declarations.

Measured collections, measured windows, `listView()`, and subscription source
channels are beta. Terminal graphics are experimental until the checked-in
[compatibility matrix](./graphics-compatibility.md) has the required emulator
and physical-system evidence.
