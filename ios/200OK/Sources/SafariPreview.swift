import SafariServices
import SwiftUI

struct SafariPreview: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let configuration = SFSafariViewController.Configuration()
        configuration.entersReaderIfAvailable = false
        configuration.barCollapsingEnabled = false
        return SFSafariViewController(url: url, configuration: configuration)
    }

    func updateUIViewController(
        _ uiViewController: SFSafariViewController,
        context: Context
    ) {}
}
