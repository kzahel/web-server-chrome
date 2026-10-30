# First App Store screenshots

These are unmodified JPEG captures of the production Release simulator app
`0.1.0 (2)`, built from `fd478345d0a22ecc16f62e3bd2e456864b611460`.
They contain no DEBUG fixture, launch hook, private folder or network address.
The app is in its actual first-run stopped state; no content folder is selected.

| Set | Simulator / runtime | Size | Alpha |
| --- | --- | --- | --- |
| iphone-6.9 | iPhone 17 Pro Max / iOS 26.5 | 1320 × 2868 | none |
| ipad-13 | iPad Pro 13-inch (M5) / iOS 26.5 | 2064 × 2752 | none |

The simulator and signed device IPA use the same source, version/build and
Release configuration. These images do not claim that a simulator runs the
exported device IPA or substitute for physical TestFlight acceptance.

Both images passed `ios/scripts/check-store-metadata.sh --require-screenshots`,
visual inspection and Apple's completed asset processing. The current API
slots are `APP_IPHONE_67` and `APP_IPAD_PRO_3GEN_129`, which accepted these
current highest-resolution images. Each required family currently has one
honest controls screenshot. Running/preview states can be added after their
release-product capture is accepted. The dedicated capture simulators were
shut down and deleted after capture.

Keep future capture provenance, native dimensions, production configuration
and independent asset-processing evidence; do not replace UI with artwork.
