import UIKit
import UniformTypeIdentifiers
import ImageIO

private let appGroupId = "group.com.kulesza.platekeeper"
private let sharedImageFilename = "shared_image.jpg"
private let pendingShareFilename = "shared_payload.json"
private let sharedAuthFilename = "shared_auth.json"
private let importModel = "gemini-2.5-flash-lite"

// ── Shared auth (written by the main app's JS layer on login/logout — see
// apps/mobile/src/utils/sharedAuth.ts) ─────────────────────────────────────────

private struct SharedAuth: Decodable {
    let token: String
    let apiBaseUrl: String
}

// ── Recognition DTOs (mirror services/api/src/api/models.py) ──────────────────

private struct ImportIngredient: Decodable {
    let qty: String?
    let unit: String?
    let name: String
    let note: String?
}

private struct ImportComponent: Decodable {
    let role: String?
    let name: String?
    let yieldNote: String?
    let ingredients: [ImportIngredient]
    let steps: [String]
}

private struct RecipeExtraction: Decodable {
    let title: String?
    let servings: Int?
    let kcalPerServing: Int?
    let components: [ImportComponent]
}

private struct ImportMetadata: Decodable {
    let thumbnailUrl: String?
}

private struct ImportResultDTO: Decodable {
    let recipe: RecipeExtraction?
    let metadata: ImportMetadata
    let error: String?
}

// ── Save DTOs (mirror RecipeSaveRequest/SaveComponent in models.py) ───────────

private struct SaveComponent: Encodable {
    let name: String
    let yieldNote: String
    let ingredients: [String]
    let steps: [String]
}

private struct RecipeSaveRequestDTO: Encodable {
    let title: String
    let servings: Int?
    let kcalPerServing: Int?
    let thumbnailUrl: String?
    let components: [SaveComponent]
}

// Mirrors serializeIngredient() in packages/shared/src/utils/ingredientUtils.ts —
// the save endpoint takes ingredients as single display strings, not structured fields.
private func serializeIngredient(_ ing: ImportIngredient) -> String {
    var parts: [String] = []
    if let qty = ing.qty, !qty.isEmpty { parts.append(qty) }
    if let unit = ing.unit, !unit.isEmpty { parts.append(unit) }
    parts.append(ing.name)
    if let note = ing.note, !note.isEmpty { parts.append("(\(note))") }
    return parts.joined(separator: " ")
}

final class ShareViewController: UIViewController {

    // MARK: UI

    private let imageView: UIImageView = {
        let iv = UIImageView()
        iv.contentMode = .scaleAspectFill
        iv.clipsToBounds = true
        iv.layer.cornerRadius = 14
        iv.translatesAutoresizingMaskIntoConstraints = false
        iv.isHidden = true
        return iv
    }()

    private let spinner: UIActivityIndicatorView = {
        let s = UIActivityIndicatorView(style: .medium)
        s.translatesAutoresizingMaskIntoConstraints = false
        return s
    }()

    private let statusLabel: UILabel = {
        let l = UILabel()
        l.text = "Loading…"
        l.font = .systemFont(ofSize: 16, weight: .semibold)
        l.textColor = .label
        l.textAlignment = .center
        l.numberOfLines = 0
        l.translatesAutoresizingMaskIntoConstraints = false
        return l
    }()

    private let detailLabel: UILabel = {
        let l = UILabel()
        l.font = .systemFont(ofSize: 13, weight: .regular)
        l.textColor = .secondaryLabel
        l.textAlignment = .center
        l.numberOfLines = 0
        l.translatesAutoresizingMaskIntoConstraints = false
        l.isHidden = true
        return l
    }()

    private lazy var saveButton: UIButton = {
        let b = UIButton(type: .system)
        b.setTitle("Save Recipe", for: .normal)
        b.setTitleColor(.white, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        b.backgroundColor = .systemBlue
        b.layer.cornerRadius = 10
        b.contentEdgeInsets = UIEdgeInsets(top: 12, left: 28, bottom: 12, right: 28)
        b.translatesAutoresizingMaskIntoConstraints = false
        b.isHidden = true
        b.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)
        return b
    }()

    private lazy var doneButton: UIButton = {
        let b = UIButton(type: .system)
        b.setTitle("Done", for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 16, weight: .medium)
        b.translatesAutoresizingMaskIntoConstraints = false
        b.isHidden = true
        b.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        return b
    }()

    private lazy var stack: UIStackView = {
        let s = UIStackView(arrangedSubviews: [imageView, spinner, statusLabel, detailLabel, saveButton, doneButton])
        s.axis = .vertical
        s.alignment = .center
        s.spacing = 14
        s.translatesAutoresizingMaskIntoConstraints = false
        return s
    }()

    // Recognized recipe + the original photo, kept around so Save can be retried on failure.
    private var pendingSave: (recipe: RecipeExtraction, thumbnailUrl: String?, imageBase64: String, mimeType: String, auth: SharedAuth)?

    // Pending text/URL share — shown in the confirmation UI before opening the main app.
    private var pendingOpenShare: (type: String, value: String)?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            imageView.widthAnchor.constraint(equalToConstant: 120),
            imageView.heightAnchor.constraint(equalToConstant: 120),
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -32),
        ])
        spinner.startAnimating()

        handleSharedContent()
    }

    // Scan every attachment for image or text content. Image takes precedence when both
    // are present. Text shares are handled inline in the extension UI rather than
    // immediately deep-linking, which caused the card to flash and disappear.
    private func handleSharedContent() {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            NSLog("[ShareExtension] no input items")
            complete()
            return
        }
        NSLog("[ShareExtension] \(items.count) input item(s), \(items.compactMap { $0.attachments?.count }) attachment counts")

        for item in items {
            guard let providers = item.attachments else { continue }
            NSLog("[ShareExtension] item providers: \(providers.map { $0.registeredTypeIdentifiers })")

            if let imageProvider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }) {
                NSLog("[ShareExtension] matched image provider")
                imageProvider.loadItem(forTypeIdentifier: UTType.image.identifier) { [weak self] result, _ in
                    self?.handleImageResult(result)
                }
                return
            }

            if let textProvider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) }) {
                NSLog("[ShareExtension] matched text provider")
                textProvider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] result, error in
                    guard let self else { return }
                    NSLog("[ShareExtension] text loadItem result type=\(type(of: result as Any)) error=\(String(describing: error))")

                    // loadItem can return String, URL (temp file), or Data depending on the source app.
                    let text: String?
                    if let s = result as? String {
                        text = s
                    } else if let url = result as? URL, let s = try? String(contentsOf: url, encoding: .utf8) {
                        text = s
                    } else if let data = result as? Data, let s = String(data: data, encoding: .utf8) {
                        text = s
                    } else {
                        text = nil
                    }

                    guard let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                        NSLog("[ShareExtension] text result was empty or unreadable")
                        self.complete()
                        return
                    }

                    // Some apps (Instagram, X) share a link as plain text — detect it and
                    // route accordingly so the main app opens the correct import mode.
                    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    let isURL = URL(string: trimmed).flatMap { $0.scheme }.map { $0.hasPrefix("http") } ?? false
                    let shareType = isURL ? "url" : "text"
                    let shareValue = isURL ? trimmed : String(trimmed.prefix(2000))
                    // Persist immediately as fallback for host apps that decline extensionContext.open().
                    self.persistPendingShare(type: shareType, value: shareValue)
                    DispatchQueue.main.async {
                        self.showSharedText(isURL: isURL, shareType: shareType, shareValue: shareValue)
                    }
                }
                return
            }
        }

        complete()
    }

    private func handleImageResult(_ result: Any?) {
        NSLog("[ShareExtension] handleImageResult: result type = \(type(of: result as Any))")

        // Share extensions have a tight memory budget (~120MB). Decoding a full-resolution
        // photo (modern phones shoot 24-48MP) into a UIImage before resizing can blow that
        // budget and get the extension jetsam-killed, which looks like the share sheet just
        // silently closing. ImageIO's thumbnail API downsamples during decode instead, so the
        // full-size bitmap is never materialized.
        guard let jpegData = Self.downsampledJPEGData(from: result, maxDimension: 1600, compressionQuality: 0.7) else {
            NSLog("[ShareExtension] downsampledJPEGData returned nil")
            complete()
            return
        }
        NSLog("[ShareExtension] downsampledJPEGData succeeded, \(jpegData.count) bytes")

        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
            NSLog("[ShareExtension] containerURL(forSecurityApplicationGroupIdentifier:) returned nil for \(appGroupId)")
            complete()
            return
        }
        NSLog("[ShareExtension] containerURL resolved: \(containerURL.path)")

        let fileURL = containerURL.appendingPathComponent(sharedImageFilename)
        do {
            try jpegData.write(to: fileURL, options: .atomic)
            NSLog("[ShareExtension] wrote shared image to \(fileURL.path)")
        } catch {
            NSLog("[ShareExtension] failed to write shared image: \(error)")
            complete()
            return
        }

        // Write the manifest immediately so the main app can pick up the share even if iOS
        // kills this extension process before recognizeImage() returns (iOS extensions have
        // a hard ~30s time limit and the Gemini call can exceed that under load).
        persistPendingShare(type: "image", value: sharedImageFilename)

        guard let auth = Self.loadSharedAuth(containerURL: containerURL) else {
            NSLog("[ShareExtension] no shared auth found — falling back to persist+deep-link")
            openApp(type: "image", value: sharedImageFilename)
            return
        }

        let imageBase64 = jpegData.base64EncodedString()
        let mimeType = "image/jpeg"
        DispatchQueue.main.async { [weak self] in
            self?.imageView.image = UIImage(data: jpegData)
            self?.imageView.isHidden = false
            self?.statusLabel.text = "Recognizing recipe…"
        }

        recognizeImage(auth: auth, imageBase64: imageBase64, mimeType: mimeType) { [weak self] outcome in
            guard let self else { return }
            switch outcome {
            case .failure(let error):
                // Couldn't even get a recognition result (offline, server error, stale token) —
                // we haven't shown the user anything definitive yet, so it's safe to hand off to
                // the old mechanism rather than leaving them with a dead end.
                NSLog("[ShareExtension] recognizeImage failed: \(error) — falling back to persist+deep-link")
                DispatchQueue.main.async {
                    self.openApp(type: "image", value: sharedImageFilename)
                }
            case .success(let result):
                DispatchQueue.main.async {
                    if let recipe = result.recipe {
                        self.showRecipeFound(recipe, thumbnailUrl: result.metadata.thumbnailUrl, imageBase64: imageBase64, mimeType: mimeType, auth: auth)
                    } else {
                        self.showNoRecipe(message: result.error ?? "No recipe found in this photo.")
                    }
                }
            }
        }
    }

    // MARK: Text/URL share confirmation UI

    private func showSharedText(isURL: Bool, shareType: String, shareValue: String) {
        pendingOpenShare = (type: shareType, value: shareValue)

        spinner.stopAnimating()
        spinner.isHidden = true
        statusLabel.text = isURL ? "URL detected" : "Text detected"

        let preview = shareValue.count > 120 ? String(shareValue.prefix(120)) + "…" : shareValue
        detailLabel.text = preview
        detailLabel.isHidden = false

        saveButton.setTitle("Open in PlateKeeper", for: .normal)
        saveButton.isEnabled = true
        saveButton.isHidden = false
    }

    // MARK: Rich recognize/save states (image shares with a valid shared auth only)

    private func showRecipeFound(_ recipe: RecipeExtraction, thumbnailUrl: String?, imageBase64: String, mimeType: String, auth: SharedAuth) {
        pendingSave = (recipe, thumbnailUrl, imageBase64, mimeType, auth)

        spinner.stopAnimating()
        spinner.isHidden = true
        statusLabel.text = (recipe.title?.isEmpty == false ? recipe.title : nil) ?? "Recipe found"

        let ingredientCount = recipe.components.reduce(0) { $0 + $1.ingredients.count }
        let stepCount = recipe.components.reduce(0) { $0 + $1.steps.count }
        detailLabel.text = "\(ingredientCount) ingredients · \(stepCount) steps\nYou can adjust it in the app"
        detailLabel.isHidden = false

        saveButton.setTitle("Save Recipe", for: .normal)
        saveButton.isEnabled = true
        saveButton.isHidden = false
    }

    private func showNoRecipe(message: String) {
        spinner.stopAnimating()
        spinner.isHidden = true
        statusLabel.text = message
        doneButton.isHidden = false
    }

    @objc private func saveTapped() {
        // Text/URL share — open the main app and let it handle the import.
        if let pending = pendingOpenShare {
            saveButton.isEnabled = false
            openApp(type: pending.type, value: pending.value)
            return
        }

        guard let pending = pendingSave else { return }
        saveButton.isEnabled = false
        saveButton.setTitle("Saving…", for: .normal)
        detailLabel.isHidden = true

        let body = Self.buildSaveRequest(
            from: pending.recipe,
            thumbnailUrl: pending.thumbnailUrl,
            imageBase64: pending.imageBase64,
            mimeType: pending.mimeType
        )
        saveRecipe(auth: pending.auth, body: body) { [weak self] outcome in
            guard let self else { return }
            DispatchQueue.main.async {
                switch outcome {
                case .success:
                    self.statusLabel.text = "Saved ✓"
                    self.saveButton.isHidden = true
                    self.detailLabel.isHidden = true
                    // Recipe was saved directly from the extension — remove the fallback manifest
                    // so the main app doesn't re-import the same photo on next foreground.
                    self.cleanupAppGroupFiles()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { [weak self] in
                        self?.complete()
                    }
                case .failure(let error):
                    NSLog("[ShareExtension] saveRecipe failed: \(error)")
                    self.detailLabel.text = "Couldn't save. Check your connection and try again."
                    self.detailLabel.isHidden = false
                    self.saveButton.isEnabled = true
                    self.saveButton.setTitle("Save Recipe", for: .normal)
                }
            }
        }
    }

    @objc private func doneTapped() {
        // No recipe / user cancelled — clean up the pending manifest.
        cleanupAppGroupFiles()
        complete()
    }

    private func cleanupAppGroupFiles() {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else { return }
        for name in [pendingShareFilename, sharedImageFilename] {
            try? FileManager.default.removeItem(at: containerURL.appendingPathComponent(name))
        }
    }

    // MARK: Direct API calls

    private func recognizeImage(
        auth: SharedAuth,
        imageBase64: String,
        mimeType: String,
        completion: @escaping (Result<ImportResultDTO, Error>) -> Void
    ) {
        guard let url = URL(string: "\(auth.apiBaseUrl)/api/imports/image") else {
            completion(.failure(URLError(.badURL)))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 45
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(auth.token)", forHTTPHeaderField: "Authorization")
        let body: [String: Any] = ["image_base64": imageBase64, "mime_type": mimeType, "model": importModel]
        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else {
            completion(.failure(URLError(.cannotCreateFile)))
            return
        }
        request.httpBody = bodyData

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                completion(.failure(error))
                return
            }
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), let data else {
                completion(.failure(URLError(.badServerResponse)))
                return
            }
            do {
                let decoder = JSONDecoder()
                decoder.keyDecodingStrategy = .convertFromSnakeCase
                completion(.success(try decoder.decode(ImportResultDTO.self, from: data)))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }

    private func saveRecipe(auth: SharedAuth, body: RecipeSaveRequestDTO, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let url = URL(string: "\(auth.apiBaseUrl)/api/recipes") else {
            completion(.failure(URLError(.badURL)))
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(auth.token)", forHTTPHeaderField: "Authorization")
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        guard let bodyData = try? encoder.encode(body) else {
            completion(.failure(URLError(.cannotCreateFile)))
            return
        }
        request.httpBody = bodyData

        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error {
                completion(.failure(error))
                return
            }
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                completion(.failure(URLError(.badServerResponse)))
                return
            }
            completion(.success(()))
        }.resume()
    }

    private static func buildSaveRequest(
        from recipe: RecipeExtraction,
        thumbnailUrl: String?,
        imageBase64: String,
        mimeType: String
    ) -> RecipeSaveRequestDTO {
        var components = recipe.components.map { comp in
            SaveComponent(
                name: comp.name ?? comp.role ?? "Main",
                yieldNote: comp.yieldNote ?? "",
                ingredients: comp.ingredients.map(serializeIngredient),
                steps: comp.steps
            )
        }
        if components.isEmpty {
            components = [SaveComponent(name: "Main", yieldNote: "", ingredients: [], steps: [])]
        }
        // Falls back to the shared photo itself when extraction found no separate thumbnail —
        // mirrors pendingThumbRef in ImportRecipeScreen.tsx.
        let resolvedThumbnail = (thumbnailUrl?.isEmpty == false ? thumbnailUrl : nil) ?? "data:\(mimeType);base64,\(imageBase64)"
        return RecipeSaveRequestDTO(
            title: recipe.title ?? "",
            servings: recipe.servings,
            kcalPerServing: recipe.kcalPerServing,
            thumbnailUrl: resolvedThumbnail,
            components: components
        )
    }

    private static func loadSharedAuth(containerURL: URL) -> SharedAuth? {
        let url = containerURL.appendingPathComponent(sharedAuthFilename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(SharedAuth.self, from: data)
    }

    private func openApp(type: String, value: String) {
        let truncated = type == "text" ? String(value.prefix(2000)) : value

        // extensionContext.open() is host-dependent: some host apps (e.g. Photos) decline
        // to relay the deep link even though the URL scheme is correctly registered, and the
        // share sheet just closes with nothing happening. Persist the share to the App Group
        // first so the main app can pick it up on next launch/foreground regardless of whether
        // the deep link handoff succeeds.
        persistPendingShare(type: type, value: truncated)

        guard let encoded = truncated.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let url = URL(string: "platekeeper://share?type=\(type)&value=\(encoded)") else {
            NSLog("[ShareExtension] failed to build deep link URL for type=\(type)")
            complete()
            return
        }

        NSLog("[ShareExtension] opening \(url)")
        extensionContext?.open(url) { [weak self] success in
            NSLog("[ShareExtension] extensionContext.open completion: success=\(success)")
            self?.complete()
        }
    }

    private func persistPendingShare(type: String, value: String) {
        guard let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
            NSLog("[ShareExtension] persistPendingShare: containerURL nil for \(appGroupId)")
            return
        }
        let manifest: [String: String] = ["type": type, "value": value]
        guard let data = try? JSONSerialization.data(withJSONObject: manifest) else {
            NSLog("[ShareExtension] persistPendingShare: failed to serialize manifest")
            return
        }
        let manifestURL = containerURL.appendingPathComponent(pendingShareFilename)
        do {
            try data.write(to: manifestURL, options: .atomic)
            NSLog("[ShareExtension] persisted pending share manifest to \(manifestURL.path)")
        } catch {
            NSLog("[ShareExtension] persistPendingShare write failed: \(error)")
        }
    }

    private func complete() {
        DispatchQueue.main.async { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }

    private static func downsampledJPEGData(from result: Any?, maxDimension: CGFloat, compressionQuality: CGFloat) -> Data? {
        var sourceData: Data?
        if let data = result as? Data {
            sourceData = data
        } else if let url = result as? URL {
            sourceData = try? Data(contentsOf: url)
        } else if let image = result as? UIImage {
            sourceData = image.jpegData(compressionQuality: 1.0)
        }

        guard let sourceData, let imageSource = CGImageSourceCreateWithData(sourceData as CFData, nil) else {
            return nil
        }

        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
        ]

        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(imageSource, 0, options as CFDictionary) else {
            return nil
        }

        return UIImage(cgImage: cgImage).jpegData(compressionQuality: compressionQuality)
    }
}
