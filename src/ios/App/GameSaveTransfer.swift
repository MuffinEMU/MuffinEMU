import Foundation
import UniformTypeIdentifiers

/// Moving a game's in-game save in and out of MuffinEMU.
///
/// This is the save the GAME writes - your progress, your file slots - not a save state.
/// Save states are MuffinEMU's own snapshot of the whole machine and mean nothing to any
/// other emulator; this is the Wii U's own save data, in the Wii U's own layout, which is
/// why it can travel to desktop Cemu, to another iOS emulator, or onto real hardware.
///
/// # Where it lives
///
/// `CafeSystem.cpp:201` is the authority:
///
///     ActiveSettings::GetMlcPath("usr/save/{:08X}/{:08X}/user/", titleId >> 32, titleId & 0xFFFFFFFF)
///
/// so a title's save data is `mlc/mlc01/usr/save/<HIGH>/<LOW>/`, holding `user/` (the accounts,
/// plus `common/`) and usually `meta/`. That whole title folder is what gets exported: it
/// is the unit every other Cemu install expects, and exporting only `user/` produces
/// something the other end has to know how to re-nest.
///
/// The case is worth a word. That format string is uppercase, but `iosu_acp.cpp` scans
/// with lowercase `%08x`. Cemu gets away with the inconsistency because it ships on
/// case-insensitive filesystems, and iOS is one - but a folder arriving from a
/// case-SENSITIVE Linux or Windows setup can be spelled either way, so every lookup here
/// resolves case-insensitively instead of trusting the spelling.
enum GameSaveTransfer {

    // MARK: - Locating

    private static var documents: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    }

    /// The engine's save root. The bridge hands the core `Documents/mlc` as its user-data
    /// folder and the core keeps the Wii U storage in `mlc01` under it, so a title's saves
    /// live in `Documents/mlc/mlc01/usr/save/<HIGH>/<LOW>/` (the "Save path" line in log.txt).
    private static var saveRoot: URL? {
        _ = migratedMisplacedSaves
        return documents?.appendingPathComponent("mlc/mlc01/usr/save", isDirectory: true)
    }

    /// Earlier versions imported and looked for saves in `Documents/mlc/usr/save`, one level
    /// above where the engine reads them, so imported saves never reached the game. Moves
    /// each title folder found there into the real save root, once per launch, but only
    /// when that title has no save in the real location yet - an existing save is never
    /// overwritten. Anything that can't be moved is left where it is.
    private static let migratedMisplacedSaves: Void = {
        let fm = FileManager.default
        guard let docs = documents else { return }
        let wrongRoot = docs.appendingPathComponent("mlc/usr/save", isDirectory: true)
        let rightRoot = docs.appendingPathComponent("mlc/mlc01/usr/save", isDirectory: true)
        guard let highs = try? fm.contentsOfDirectory(at: wrongRoot, includingPropertiesForKeys: nil) else { return }
        for high in highs where high.hasDirectoryPath || (try? high.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true {
            guard let lows = try? fm.contentsOfDirectory(at: high, includingPropertiesForKeys: nil) else { continue }
            let rightHigh = existingChild(of: rightRoot, named: high.lastPathComponent)
                ?? rightRoot.appendingPathComponent(high.lastPathComponent, isDirectory: true)
            for low in lows where low.lastPathComponent != ".DS_Store" {
                if let existing = existingChild(of: rightHigh, named: low.lastPathComponent),
                   let entries = try? fm.contentsOfDirectory(atPath: existing.path),
                   !entries.filter({ $0 != ".DS_Store" }).isEmpty {
                    continue
                }
                if let empty = existingChild(of: rightHigh, named: low.lastPathComponent) {
                    try? fm.removeItem(at: empty)
                }
                try? fm.createDirectory(at: rightHigh, withIntermediateDirectories: true)
                try? fm.moveItem(at: low, to: rightHigh.appendingPathComponent(low.lastPathComponent, isDirectory: true))
            }
        }
    }()

    /// `mlc/mlc01/usr/save/<HIGH>/<LOW>` for this game, whether or not it exists yet.
    ///
    /// Returns nil only when the title ID is unknown, which happens for a game whose
    /// dump could not be read - there is no save path to speak of in that case, and
    /// inventing one would create a folder no emulator would ever look in.
    static func saveDirectory(for game: GameMetadata) -> URL? {
        // Derived from the ROM when the stored value is missing, rather than giving up.
        //
        // GameMetadata.titleId is an optional that is only filled in when a game is
        // scanned, so every library entry added before that field existed decodes as nil
        // - and those are exactly the games somebody has been playing long enough to have
        // a save worth moving. Refusing to compute a path for them made this whole
        // feature report "couldn't read this game's title ID" and stop, with Export
        // greyed out beside it.
        guard let titleId = resolvedTitleId(for: game), let root = saveRoot else { return nil }
        let high = String(format: "%08X", UInt32(truncatingIfNeeded: titleId >> 32))
        let low = String(format: "%08X", UInt32(truncatingIfNeeded: titleId))
        // Resolve what is actually on disk rather than asserting our own spelling, so a
        // save folder written in lowercase by another setup is found rather than
        // shadowed by a second, empty, uppercase one.
        let highDir = existingChild(of: root, named: high) ?? root.appendingPathComponent(high, isDirectory: true)
        return existingChild(of: highDir, named: low) ?? highDir.appendingPathComponent(low, isDirectory: true)
    }

    /// The stored title ID, or one derived from the ROM when it is missing.
    ///
    /// GameMetadata.titleId is an optional only filled in when a game is scanned, so every
    /// library entry added before that field existed decodes as nil - and those are
    /// exactly the games somebody has played long enough to have a save worth moving.
    /// Giving up on them made this feature report "couldn't read this game's title ID"
    /// and stop, with Export greyed out beside it.
    private static func resolvedTitleId(for game: GameMetadata) -> UInt64? {
        game.titleId ?? GameManager.deriveBaseTitleId(romPath: game.romPath)
    }

    private static func existingChild(of parent: URL, named name: String) -> URL? {
        guard let entries = try? FileManager.default.contentsOfDirectory(
            at: parent, includingPropertiesForKeys: [.isDirectoryKey]) else { return nil }
        return entries.first { $0.lastPathComponent.caseInsensitiveCompare(name) == .orderedSame }
    }

    /// Whether there is anything worth exporting. A folder that exists but is empty
    /// counts as nothing: the engine creates the directory on first boot, well before
    /// the game has written a single byte of progress, so "the folder is there" and
    /// "you have a save" are different questions.
    static func hasSave(for game: GameMetadata) -> Bool {
        guard let dir = saveDirectory(for: game) else { return false }
        let entries = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        return !entries.filter { $0 != ".DS_Store" }.isEmpty
    }

    // MARK: - Export

    /// Stages a copy under a name a human can recognise, then hands it to the file picker.
    ///
    /// Staged rather than exported in place for two reasons: the on-disk folder is named
    /// `00050000` and nothing else, which is useless in a Files listing next to five
    /// other games; and the picker is handed a copy so that whatever it does with it
    /// cannot reach the live save.
    static func export(_ game: GameMetadata, completion: @escaping (Result<String, Error>) -> Void) {
        guard let dir = saveDirectory(for: game), hasSave(for: game) else {
            completion(.failure(TransferError.noSaveYet))
            return
        }
        do {
            let staging = FileManager.default.temporaryDirectory
                .appendingPathComponent("save-export-\(UUID().uuidString)", isDirectory: true)
            try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
            let named = staging.appendingPathComponent(exportName(for: game), isDirectory: true)
            try FileManager.default.copyItem(at: dir, to: named)

            DocumentImport.presentExport([named]) { result in
                switch result {
                case .success(let urls):
                    // An empty array is a cancel, not a failure - see the picker's own
                    // delegate. Saying "exported" after someone backed out would be a lie.
                    guard let dest = urls.first else {
                        completion(.failure(TransferError.cancelled))
                        return
                    }
                    completion(.success("Saved to \(dest.lastPathComponent)."))
                case .failure(let error):
                    completion(.failure(error))
                }
            }
        } catch {
            completion(.failure(error))
        }
    }

    /// `Wind Waker HD [0005000010143500] save` - the title for a human, the ID for
    /// whatever has to find it again. Characters a filesystem may object to are replaced
    /// rather than stripped, so two games cannot collapse to the same name.
    private static func exportName(for game: GameMetadata) -> String {
        let unsafe = CharacterSet(charactersIn: "/\\:*?\"<>|")
        let title = game.title.components(separatedBy: unsafe).joined(separator: "-")
        let trimmed = String(title.prefix(60)).trimmingCharacters(in: .whitespacesAndNewlines)
        // The resolved id, not the stored one - otherwise a game whose save this can now
        // find would still export under a filename saying "unknown".
        let id = resolvedTitleId(for: game).map { String(format: "%016llX", $0) } ?? "unknown"
        return "\(trimmed.isEmpty ? "Wii U game" : trimmed) [\(id)] save"
    }

    // MARK: - Import

    /// What shape of folder the user picked.
    ///
    /// People export saves from different levels depending on which guide they followed,
    /// and refusing everything but one exact shape would reject most of what actually
    /// arrives. These are the three that turn up in practice.
    private enum PickedShape {
        /// `<LOW>/` - holds `user/`, usually `meta/`. What this app's own export produces.
        case titleFolder
        /// `user/` - holds `common/` and/or per-account folders.
        case userFolder
        /// `<HIGH>/` - holds one or more `<LOW>` folders.
        case highFolder(titleFolder: URL)
    }

    private static func shape(of url: URL) -> PickedShape? {
        let fm = FileManager.default
        func hasDir(_ name: String) -> Bool {
            existingChild(of: url, named: name).map { u in
                (try? u.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
            } ?? false
        }
        if hasDir("user") { return .titleFolder }
        if hasDir("common") { return .userFolder }

        let children = (try? fm.contentsOfDirectory(at: url, includingPropertiesForKeys: [.isDirectoryKey])) ?? []
        let hexDirs = children.filter {
            $0.lastPathComponent.count == 8
                && $0.lastPathComponent.allSatisfy(\.isHexDigit)
                && (try? $0.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true
        }
        // A <HIGH> folder's children are title folders, and a title folder contains
        // user/. That test is what separates it from a user/ folder, whose children are
        // account IDs - also eight hex digits, but with nothing named user inside.
        if let title = hexDirs.first(where: { existingChild(of: $0, named: "user") != nil }) {
            return .highFolder(titleFolder: title)
        }
        if !hexDirs.isEmpty { return .userFolder }
        return nil
    }

    /// Copies a picked folder into this game's save directory, keeping a backup.
    ///
    /// The existing save is moved aside first, always, even when it looks empty. Getting
    /// this wrong costs somebody a playthrough, and there is no undo for a file that has
    /// already been replaced - so the backup is not conditional on anything.
    static func importSave(_ game: GameMetadata, from picked: URL) throws -> String {
        guard let destination = saveDirectory(for: game) else { throw TransferError.unknownTitleId }

        let scoped = picked.startAccessingSecurityScopedResource()
        defer { if scoped { picked.stopAccessingSecurityScopedResource() } }

        guard let shape = shape(of: picked) else { throw TransferError.unrecognisedFolder }

        let fm = FileManager.default
        var backupNote = ""
        if fm.fileExists(atPath: destination.path) {
            let stamp = ISO8601DateFormatter().string(from: Date())
                .replacingOccurrences(of: ":", with: "-")
            // Deliberately OUTSIDE mlc. A backup left beside the real save would be
            // scanned by the engine as though it were another title.
            guard let docs = documents else { throw TransferError.unknownTitleId }
            let backups = docs.appendingPathComponent("save-backups/\(game.id)/\(stamp)", isDirectory: true)
            try fm.createDirectory(at: backups.deletingLastPathComponent(), withIntermediateDirectories: true)
            try fm.moveItem(at: destination, to: backups)
            backupNote = " Your previous save was backed up first."
        }
        try fm.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)

        switch shape {
        case .titleFolder:
            try fm.copyItem(at: picked, to: destination)
        case .highFolder(let titleFolder):
            try fm.copyItem(at: titleFolder, to: destination)
        case .userFolder:
            // Re-nest it: the folder is the contents of user/, so it has to land there
            // rather than at the title level, or the engine finds an empty save.
            try fm.createDirectory(at: destination, withIntermediateDirectories: true)
            try fm.copyItem(at: picked, to: destination.appendingPathComponent("user", isDirectory: true))
        }
        return "Save imported.\(backupNote) Start the game to check it."
    }

    enum TransferError: LocalizedError {
        case noSaveYet
        case unknownTitleId
        case unrecognisedFolder
        case cancelled

        var errorDescription: String? {
            switch self {
            case .noSaveYet:
                return "There's no save for this game yet. Play it once, then export."
            case .unknownTitleId:
                return "MuffinEMU couldn't read this game's title ID, so it doesn't know where its save lives."
            case .unrecognisedFolder:
                return "That folder doesn't look like a Wii U save. Pick the folder named after the game's title ID, or the 'user' folder inside it."
            case .cancelled:
                return "Export cancelled."
            }
        }
    }
}
