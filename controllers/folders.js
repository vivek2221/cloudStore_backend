import { verifyToken } from "../tokensCreation.js";
import { modelFoldersData, modelFilesData, modelUserData } from "../mongooseSchema.js";

// Helper to format file size
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

export const allFolders = async (req, res) => {
    try {
        const { folderId } = req.query;
        const accessToken = req.headers['authorization'];
        if (!accessToken) {
            return res.status(401).json({ error: "Unauthorized: Missing token" });
        }
        const decoded = verifyToken(accessToken);
        if (!decoded) {
            return res.status(401).json({ error: "Unauthorized: Invalid token" });
        }
        const userId = decoded.userId;

        // Find current folder
        const currentFolderInfo = await modelFoldersData.findOne({ _id: folderId, userId });
        if (!currentFolderInfo || currentFolderInfo.deleted) {
            return res.status(404).json({ error: "Folder not found" });
        }

        // Find subfolders
        const subFolders = await modelFoldersData.find({ parentFolderId: folderId, userId, deleted: false });

        // Find subfiles
        const subFiles = await modelFilesData.find({ parentFolderId: folderId, userId, deleted: false });

        // Find all active files for this user to compute total storage used
        const allUserFiles = await modelFilesData.find({ userId, deleted: false });
        const totalStorageUsedBytes = allUserFiles.reduce((acc, file) => acc + (file.fileSizeBytes || 0), 0);
        const totalStorageUsed = formatBytes(totalStorageUsedBytes);

        return res.status(200).json({
            folders: subFolders,
            files: subFiles,
            totalStorageUsed,
            totalStorageUsedBytes,
            currentFolderInfo
        });
    } catch (error) {
        console.error("Error in allFolders:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const createFolder = async (req, res) => {
    try {
        const { folderName, parentFolderId } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;
        const user = await modelUserData.findById(userId);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Check for duplicates in same folder
        const duplicate = await modelFoldersData.findOne({
            parentFolderId,
            userId,
            folderName: { $regex: new RegExp(`^${folderName.trim()}$`, 'i') },
            deleted: false
        });
        if (duplicate) {
            return res.status(400).json({ error: "Folder already exists" });
        }

        const newFolder = await modelFoldersData.create({
            folderName: folderName.trim(),
            parentFolderId,
            userId,
            userName: user.name,
            typeOfFolder: 'regular',
            deleted: false,
            modifiedDate: new Date()
        });

        return res.status(200).json(newFolder);
    } catch (error) {
        console.error("Error creating folder:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const renameFolder = async (req, res) => {
    try {
        const { folderId, newName } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        const folder = await modelFoldersData.findOne({ _id: folderId, userId });
        if (!folder || folder.deleted) {
            return res.status(404).json({ error: "Folder not found" });
        }

        // Check for duplicate in same parent folder
        const duplicate = await modelFoldersData.findOne({
            parentFolderId: folder.parentFolderId,
            userId,
            folderName: { $regex: new RegExp(`^${newName.trim()}$`, 'i') },
            deleted: false,
            _id: { $ne: folderId }
        });
        if (duplicate) {
            return res.status(400).json({ error: "Folder with this name already exists" });
        }

        folder.folderName = newName.trim();
        folder.modifiedDate = new Date();
        await folder.save();

        return res.status(200).json(folder);
    } catch (error) {
        console.error("Error renaming folder:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const deleteFolder = async (req, res) => {
    try {
        const { folderId } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        const folder = await modelFoldersData.findOne({ _id: folderId, userId });
        if (!folder) {
            return res.status(404).json({ error: "Folder not found" });
        }

        // Soft delete the folder and all its contents recursively
        const softDeleteFolderRecursive = async (fid) => {
            await modelFoldersData.updateOne({ _id: fid, userId }, { deleted: true, modifiedDate: new Date() });
            await modelFilesData.updateMany({ parentFolderId: fid, userId }, { deleted: true, modifiedDate: new Date() });

            const childFolders = await modelFoldersData.find({ parentFolderId: fid, userId });
            for (const child of childFolders) {
                await softDeleteFolderRecursive(child._id);
            }
        };

        await softDeleteFolderRecursive(folderId);

        return res.status(200).json({ message: "Folder and all its contents moved to recycle bin" });
    } catch (error) {
        console.error("Error deleting folder:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
