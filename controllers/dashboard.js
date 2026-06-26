import { verifyToken } from '../tokensCreation.js';
import { modelFilesData, modelFoldersData, modelUserData } from '../mongooseSchema.js';
import fs from 'fs';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, bucketName } from '../s3Client.js';

export const getTrash = async (req, res) => {
    try {
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        // Find all deleted folders and files for user
        const trashFolders = await modelFoldersData.find({ userId, deleted: true });
        const trashFiles = await modelFilesData.find({ userId, deleted: true });

        // Filter out items whose ancestors are also in the recycle bin
        const filteredFolders = [];
        for (const folder of trashFolders) {
            let ancestorDeleted = false;
            let currentParentId = folder.parentFolderId;
            while (currentParentId) {
                const parent = await modelFoldersData.findOne({ _id: currentParentId, userId });
                if (parent && parent.deleted) {
                    ancestorDeleted = true;
                    break;
                }
                currentParentId = parent ? parent.parentFolderId : null;
            }
            if (!ancestorDeleted) {
                filteredFolders.push(folder);
            }
        }

        const filteredFiles = [];
        for (const file of trashFiles) {
            let ancestorDeleted = false;
            let currentParentId = file.parentFolderId;
            while (currentParentId) {
                const parent = await modelFoldersData.findOne({ _id: currentParentId, userId });
                if (parent && parent.deleted) {
                    ancestorDeleted = true;
                    break;
                }
                currentParentId = parent ? parent.parentFolderId : null;
            }
            if (!ancestorDeleted) {
                filteredFiles.push(file);
            }
        }

        return res.status(200).json({ folders: filteredFolders, files: filteredFiles });
    } catch (error) {
        console.error("Error in getTrash:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const getRecentFiles = async (req, res) => {
    try {
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        const files = await modelFilesData.find({ userId, deleted: false })
            .sort({ modifiedDate: -1 })
            .limit(10);

        return res.status(200).json({ files });
    } catch (error) {
        console.error("Error in getRecentFiles:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const restoreItem = async (req, res) => {
    try {
        const { itemId, type } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;
        const user = await modelUserData.findById(userId);

        if (type === 'folder') {
            const folder = await modelFoldersData.findOne({ _id: itemId, userId });
            if (!folder) return res.status(404).json({ error: "Folder not found" });

            // If the parent folder is also deleted, move this folder to the user's root folder
            if (folder.parentFolderId) {
                const parent = await modelFoldersData.findOne({ _id: folder.parentFolderId, userId });
                if (!parent || parent.deleted) {
                    folder.parentFolderId = user.parentFolderId;
                    await folder.save();
                }
            }

            const restoreFolderRecursive = async (fid) => {
                await modelFoldersData.updateOne({ _id: fid, userId }, { deleted: false, modifiedDate: new Date() });
                await modelFilesData.updateMany({ parentFolderId: fid, userId }, { deleted: false, modifiedDate: new Date() });

                const childFolders = await modelFoldersData.find({ parentFolderId: fid, userId });
                for (const child of childFolders) {
                    await restoreFolderRecursive(child._id);
                }
            };

            await restoreFolderRecursive(itemId);
            return res.status(200).json({ message: "Folder restored successfully" });

        } else if (type === 'file') {
            const file = await modelFilesData.findOne({ _id: itemId, userId });
            if (!file) return res.status(404).json({ error: "File not found" });

            // If the parent folder is deleted, move this file to the user's root folder
            if (file.parentFolderId) {
                const parent = await modelFoldersData.findOne({ _id: file.parentFolderId, userId });
                if (!parent || parent.deleted) {
                    file.parentFolderId = user.parentFolderId;
                }
            }

            file.deleted = false;
            file.modifiedDate = new Date();
            await file.save();

            return res.status(200).json({ message: "File restored successfully" });
        } else {
            return res.status(400).json({ error: "Invalid type" });
        }
    } catch (error) {
        console.error("Error in restoreItem:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const permanentDeleteItem = async (req, res) => {
    try {
        const { itemId, type } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        if (type === 'folder') {
            const folder = await modelFoldersData.findOne({ _id: itemId, userId });
            if (!folder) return res.status(404).json({ error: "Folder not found" });

            const deletePhysicalFile = async (f) => {
                if (f.s3Key) {
                    try {
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: bucketName,
                            Key: f.s3Key
                        }));
                    } catch (err) {
                        console.error(`Error deleting file ${f.s3Key} from S3:`, err);
                    }
                } else if (f.diskPath && fs.existsSync(f.diskPath)) {
                    try {
                        fs.unlinkSync(f.diskPath);
                    } catch (e) {
                        console.error(`Error deleting local file ${f.diskPath}:`, e);
                    }
                }
            };

            const deleteFolderPhysicalRecursive = async (fid) => {
                const filesToDelete = await modelFilesData.find({ parentFolderId: fid, userId });
                for (const f of filesToDelete) {
                    await deletePhysicalFile(f);
                    await modelFilesData.deleteOne({ _id: f._id });
                }

                const childFolders = await modelFoldersData.find({ parentFolderId: fid, userId });
                for (const child of childFolders) {
                    await deleteFolderPhysicalRecursive(child._id);
                }

                await modelFoldersData.deleteOne({ _id: fid, userId });
            };

            await deleteFolderPhysicalRecursive(itemId);
            return res.status(200).json({ message: "Folder and all files permanently deleted" });

        } else if (type === 'file') {
            const file = await modelFilesData.findOne({ _id: itemId, userId });
            if (!file) return res.status(404).json({ error: "File not found" });

            const deletePhysicalFile = async (f) => {
                if (f.s3Key) {
                    try {
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: bucketName,
                            Key: f.s3Key
                        }));
                    } catch (err) {
                        console.error(`Error deleting file ${f.s3Key} from S3:`, err);
                    }
                } else if (f.diskPath && fs.existsSync(f.diskPath)) {
                    try {
                        fs.unlinkSync(f.diskPath);
                    } catch (e) {
                        console.error(`Error deleting local file ${f.diskPath}:`, e);
                    }
                }
            };

            await deletePhysicalFile(file);
            await modelFilesData.deleteOne({ _id: itemId, userId });

            return res.status(200).json({ message: "File permanently deleted" });
        } else {
            return res.status(400).json({ error: "Invalid type" });
        }
    } catch (error) {
        console.error("Error in permanentDeleteItem:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
