import bcrypt from 'bcrypt'
import { generateAccessToken, generateRefreshToken } from '../tokensCreation.js';
import { modelFoldersData, modelUserData } from '../mongooseSchema.js';
import { redisClient } from '../redisClient.js';
import 'dotenv/config'

export const register = async (req,res)=>{
	const {name,email,password:pass}=req.body;
	const password=await bcrypt.hash(pass,parseInt(process.env.SALT_ROUNDS));
	const ress = await modelUserData.create({name,email,password});
	const folderMain=await modelFoldersData.create({capacity:10,userName:ress.name,userId:ress._id,typeOfFolder:'root'})
    ress.parentFolderId=folderMain._id;
	await ress.save()
	const accessToken=generateAccessToken(ress._id)
	const refreshToken=generateRefreshToken(ress._id)
	res.cookie('refreshToken',refreshToken,{
		maxAge:1000*60*60*24*7,
		httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        sameSite: process.env.COOKIE_SAME_SITE || 'strict'
	})
	redisClient.set(refreshToken,'refreshTokenType',{
		EX: 60 * 60 * 24 * 7
	});
    res.json({accessToken:accessToken,mainPage:'go',name:name,folderId:folderMain._id});
}