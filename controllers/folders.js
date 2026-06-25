import { verifyToken } from "../tokensCreation.js";
import {  modelFoldersData, modelFilesData } from "../mongooseSchema.js";

export const allFolders = async (req, res) => {
    try {
        const {folderId} = req.query
        const accessToken=req.headers['authorization']
        const decoded = verifyToken(accessToken);
        const parentId = decoded.userId;
        let foldersAndFiles = await modelFoldersData.find({_id:folderId})
        foldersAndFiles= {folders:foldersAndFiles.subFolders,files:foldersAndFiles.subFiles}
        return res.status(200).json({
            foldersAndFiles
        });
    } catch (error) {
        console.error("Error in allFolders:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
