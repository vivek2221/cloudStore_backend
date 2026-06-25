import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { verifyToken } from '../tokensCreation.js';
import { modelFilesData, modelFoldersData } from '../mongooseSchema.js';
import jwt from 'jsonwebtoken';

const privateKey = fs.readFileSync('./private.pem', 'utf8');

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './allDocs';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

export const upload = multer({ storage });

export const uploadFile = async (req, res) => {
    try {
        const { parentFolderId } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const formatBytes = (bytes) => {
          if (bytes === 0) return '0 Bytes';
          const k = 1024;
          const sizes = ['Bytes', 'KB', 'MB', 'GB'];
          const i = Math.floor(Math.log(bytes) / Math.log(k));
          return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        };

        const fileSizeBytes = req.file.size;
        const fileSize = formatBytes(fileSizeBytes);

        // Check if there is already a file with the same name in the same folder
        const duplicate = await modelFilesData.findOne({
            parentFolderId,
            userId,
            fileName: req.file.originalname,
            deleted: false
        });
        if (duplicate) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: "File with this name already exists in this folder" });
        }

        const newFile = await modelFilesData.create({
            fileName: req.file.originalname,
            fileSize,
            fileSizeBytes,
            parentFolderId,
            userId,
            deleted: false,
            modifiedDate: new Date(),
            diskPath: req.file.path,
            mimeType: req.file.mimetype
        });

        return res.status(200).json(newFile);
    } catch (error) {
        console.error("Error in uploadFile:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const getFileFromToken = async (fileId, token) => {
    const decoded = verifyToken(token);
    if (!decoded) return null;

    if (decoded.fileId) {
        // Share token
        if (decoded.fileId !== fileId) return null;
        return await modelFilesData.findOne({ _id: fileId, deleted: false });
    } else {
        // Regular access token
        const userId = decoded.userId;
        return await modelFilesData.findOne({ _id: fileId, userId, deleted: false });
    }
};

export const downloadFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const { token } = req.query;

        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const file = await getFileFromToken(fileId, token);
        if (!file) return res.status(404).json({ error: "File not found or unauthorized" });

        const resolvedPath = path.resolve(file.diskPath);
        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ error: "Physical file not found on server disk" });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        return res.sendFile(resolvedPath);
    } catch (error) {
        console.error("Error in downloadFile:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const viewFile = async (req, res) => {
    try {
        const { fileId } = req.params;
        const { token } = req.query;

        if (!token) return res.status(401).json({ error: "Unauthorized" });

        const file = await getFileFromToken(fileId, token);
        if (!file) return res.status(404).json({ error: "File not found or unauthorized" });

        const resolvedPath = path.resolve(file.diskPath);
        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ error: "Physical file not found on server disk" });
        }

        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);
        res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
        return res.sendFile(resolvedPath);
    } catch (error) {
        console.error("Error in viewFile:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const renameFile = async (req, res) => {
    try {
        const { fileId, newName } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        const file = await modelFilesData.findOne({ _id: fileId, userId });
        if (!file || file.deleted) {
            return res.status(404).json({ error: "File not found" });
        }

        // Check duplicate name in same folder
        const duplicate = await modelFilesData.findOne({
            parentFolderId: file.parentFolderId,
            userId,
            fileName: newName.trim(),
            deleted: false,
            _id: { $ne: fileId }
        });
        if (duplicate) {
            return res.status(400).json({ error: "File with this name already exists in this folder" });
        }

        file.fileName = newName.trim();
        file.modifiedDate = new Date();
        await file.save();

        return res.status(200).json(file);
    } catch (error) {
        console.error("Error in renameFile:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const deleteFile = async (req, res) => {
    try {
        const { fileId } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        const file = await modelFilesData.findOne({ _id: fileId, userId });
        if (!file) {
            return res.status(404).json({ error: "File not found" });
        }

        file.deleted = true;
        file.modifiedDate = new Date();
        await file.save();

        return res.status(200).json({ message: "File moved to recycle bin" });
    } catch (error) {
        console.error("Error in deleteFile:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const shareFile = async (req, res) => {
    try {
        const { fileId, expiresIn } = req.body;
        const accessToken = req.headers['authorization'];
        if (!accessToken) return res.status(401).json({ error: "Unauthorized" });

        const decoded = verifyToken(accessToken);
        if (!decoded) return res.status(401).json({ error: "Unauthorized" });

        const userId = decoded.userId;

        const file = await modelFilesData.findOne({ _id: fileId, userId, deleted: false });
        if (!file) return res.status(404).json({ error: "File not found" });

        // Generate a share JWT token containing the fileId
        const shareToken = jwt.sign({ fileId }, privateKey, { algorithm: 'RS256', expiresIn });

        // Construct share URL
        const host = req.get('host');
        const protocol = req.protocol;
        const shareUrl = `${protocol}://${host}/downloadFile/${fileId}?token=${shareToken}`;

        return res.status(200).json({ shareUrl });
    } catch (error) {
        console.error("Error in shareFile:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
