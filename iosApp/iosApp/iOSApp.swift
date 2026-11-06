import SwiftUI
import Shared

@main
struct iOSApp: App {
    init() { IosEntryKt.startDrift() }
    var body: some Scene {
        WindowGroup { ContentView().ignoresSafeArea(.keyboard) }
    }
}

struct ContentView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UIViewController { IosEntryKt.MainViewController() }
    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {}
}
