import { redisClient } from "../redisClient.js";
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken, verifyToken } from "../tokensCreation.js";
import { modelUserData } from "../mongooseSchema.js";
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