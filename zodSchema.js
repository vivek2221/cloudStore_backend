import { z } from 'zod';

export const registerSchema = z.object({
    name: z
        .string({ required_error: "Name is required" })
        .min(2, "Name must be at least 2 characters long")
        .max(50, "Name cannot exceed 50 characters")
        .trim(),
        
    email: z
        .string({ required_error: "Email is required" })
        .email("Invalid email address")
        .toLowerCase()
        .trim(),
        
    password: z
        .string({ required_error: "Password is required" })
        .min(6, "Password must be at least 8 characters long")
        .max(100, "Password is too long")
});