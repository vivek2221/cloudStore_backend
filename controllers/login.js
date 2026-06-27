import { redisClient } from "../redisClient.js";
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken, verifyToken } from "../tokensCreation.js";
import { modelUserData, modelFoldersData } from "../mongooseSchema.js";
import 'dotenv/config';

async function newTokenAssigning(refreshToken, redisClient, res) {
    const decodedRefresh = verifyToken(refreshToken);
    if (!decodedRefresh) {
        return res.status(401).json({ toastMessage: 'Session expired' });
    }
    const userId = decodedRefresh.userId;
    const newRefreshToken = generateRefreshToken(userId);
    const newAccessToken = generateAccessToken(userId);

    await redisClient.del(refreshToken);
    await redisClient.set(newRefreshToken, 'activeRefreshToken', {
        EX: 60 * 60 * 24 * 7
    });

    const user = await modelUserData.findOne({ _id: userId });
    if (!user) {
        return res.status(404).json({ toastMessage: 'User not found' });
    }

    res.cookie('refreshToken', newRefreshToken, {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: process.env.COOKIE_SAME_SITE || 'strict'
    });

    return res.status(200).json({
        accessToken: newAccessToken,
        mainPage: 'go',
        folderId: user.parentFolderId,
        name: user.name,
        email: user.email
    });
}

async function LoginIn(password, email, res) {
    const User = await modelUserData.findOne({ email });
    if (User) {
        const isEqual = await bcrypt.compare(password, User.password);
        if (isEqual) {
            let accessToken = generateAccessToken(User._id);
            let refreshToken = generateRefreshToken(User._id);
            await redisClient.set(refreshToken, 'refreshToken', {
                EX: 60 * 60 * 24 * 7
            });
            res.cookie('refreshToken', refreshToken, {
                maxAge: 1000 * 60 * 60 * 24 * 7,
                httpOnly: true,
                secure: process.env.COOKIE_SECURE === 'true',
                sameSite: process.env.COOKIE_SAME_SITE || 'strict'
            });
            
            return res.status(200).json({
                accessToken,
                mainPage: 'go',
                folderId: User.parentFolderId,
                name: User.name,
                email: User.email
            });
        } else {
            return res.status(401).json({ toastMessage: 'invalid credentials' });
        }
    } else {
        return res.status(401).json({ toastMessage: 'invalid credentials' });
    }
}

export const login = async (req, res) => {
    let refreshToken = req.cookies?.refreshToken;
    let { email, password, accessToken } = req.body;
    
    if (refreshToken || accessToken) {
        if (refreshToken) {
            const redisRefreshTokenIsExisting = await redisClient.get(refreshToken);
            if (redisRefreshTokenIsExisting) {
                if (accessToken) {
                    const isValidAccessToken = verifyToken(accessToken);
                    if (isValidAccessToken) {
                        const User = await modelUserData.findOne({ _id: isValidAccessToken.userId });
                        if (User) {
                            return res.status(200).json({
                                accessToken,
                                mainPage: 'go',
                                folderId: User.parentFolderId,
                                name: User.name,
                                email: User.email
                            });
                        } else {
                            return await LoginIn(password, email, res);
                        }
                    } else {
                        return await newTokenAssigning(refreshToken, redisClient, res);
                    }
                } else {
                    return await newTokenAssigning(refreshToken, redisClient, res);
                }
            } else {
                return await LoginIn(password, email, res);
            }
        } else {
            const isValidAccessToken = verifyToken(accessToken);
            if (isValidAccessToken) {
                const User = await modelUserData.findOne({ _id: isValidAccessToken.userId });
                if (User) {
                    return res.status(200).json({
                        accessToken,
                        mainPage: 'go',
                        folderId: User.parentFolderId,
                        name: User.name,
                        email: User.email
                    });
                } else {
                    return await LoginIn(password, email, res);
                }
            } else {
                return await LoginIn(password, email, res);
            }
        }
    } else {
        return await LoginIn(password, email, res);
    }
};

export const logout = async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            await redisClient.del(refreshToken);
        }
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: process.env.COOKIE_SECURE === 'true',
            sameSite: process.env.COOKIE_SAME_SITE || 'strict'
        });
        return res.status(200).json({ message: "Logged out successfully" });
    } catch (err) {
        console.error("Error in logout:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
};

export const googleLogin = async (req, res) => {
    try {
        const { key } = req.body;
        if (!key) {
            return res.status(400).json({ toastMessage: 'Google login failed: missing credential key' });
        }
        const values = JSON.parse(Buffer.from(key.split('.')[1], 'base64').toString());
        if (!values.email || !values.sub) {
            return res.status(400).json({ toastMessage: 'Google login failed: invalid token payload' });
        }

        let user = await modelUserData.findOne({ sub: values.sub });
        if (!user) {
            // Check if user with same email exists
            user = await modelUserData.findOne({ email: values.email });
            if (user) {
                // Link the google account by updating the sub field
                user.sub = values.sub;
                await user.save();
            } else {
                // Register a new user
                user = await modelUserData.create({
                    name: values.name || values.email.split('@')[0],
                    email: values.email,
                    sub: values.sub
                });
                
                // Create root folder for this new user (same as in register.js)
                const folderMain = await modelFoldersData.create({
                    capacity: 10,
                    userName: user.name,
                    userId: user._id,
                    typeOfFolder: 'root'
                });
                user.parentFolderId = folderMain._id;
                await user.save();
            }
        }

        let accessToken = generateAccessToken(user._id);
        let refreshToken = generateRefreshToken(user._id);
        
        await redisClient.set(refreshToken, 'refreshToken', {
            EX: 60 * 60 * 24 * 7
        });

        res.cookie('refreshToken', refreshToken, {
            maxAge: 1000 * 60 * 60 * 24 * 7,
            httpOnly: true,
            secure: process.env.COOKIE_SECURE === 'true',
            sameSite: process.env.COOKIE_SAME_SITE || 'strict'
        });

        return res.status(200).json({
            accessToken,
            mainPage: 'go',
            folderId: user.parentFolderId,
            name: user.name,
            email: user.email
        });
    } catch (error) {
        console.error('Error in googleLogin:', error);
        return res.status(500).json({ toastMessage: 'Internal server error' });
    }
};