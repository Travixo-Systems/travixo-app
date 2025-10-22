import { createUploadthing, type FileRouter } from "uploadthing/next";
import { createServerClient } from "@/lib/supabase/server";

const f = createUploadthing();

export const ourFileRouter = {
  // VGP Certificate uploader
  vgpCertificate: f({ 
    pdf: { 
      maxFileSize: "4MB",
      maxFileCount: 1,
    } 
  })
    .middleware(async ({ req }) => {
      // Authenticate user
      const supabase = await createServerClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        throw new Error("Unauthorized");
      }

      console.log("File upload initiated by user:", user.id);

      // Pass user data to onUploadComplete
      return { 
        userId: user.id,
        organizationId: user.user_metadata?.organization_id 
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // This code runs on server after upload completes
      console.log("Upload complete for userId:", metadata.userId);
      console.log("File URL:", file.url);

      // You can store the file URL in your database here if needed
      // For VGP, we'll store it when creating the inspection record

      return { 
        uploadedBy: metadata.userId,
        fileUrl: file.url 
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;