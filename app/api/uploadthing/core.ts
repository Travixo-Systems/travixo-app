import { createUploadthing, type FileRouter } from "uploadthing/next";
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { CookieOptions } from '@supabase/ssr';

const f = createUploadthing();

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch (error) {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch (error) {}
        },
      },
    }
  );
}

export const ourFileRouter = {
  vgpCertificate: f({ 
    pdf: { 
      maxFileSize: "4MB",
      maxFileCount: 1,
    } 
  })
    .middleware(async () => {
      const supabase = await createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        throw new Error("Unauthorized");
      }

      console.log("VGP Certificate upload by user:", user.id);

      return { 
        userId: user.id,
        organizationId: user.user_metadata?.organization_id 
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Certificate uploaded:", file.url);

      return { 
        uploadedBy: metadata.userId,
        fileUrl: file.url 
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;