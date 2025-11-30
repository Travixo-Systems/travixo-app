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
  // VGP Certificate uploads (PDF)
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

  // Organization logo uploads (Image)
  organizationLogo: f({ 
    image: { 
      maxFileSize: "2MB",
      maxFileCount: 1,
    } 
  })
    .middleware(async () => {
      const supabase = await createClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        throw new Error("Unauthorized");
      }

      // Get user's organization
      const { data: userData } = await supabase
        .from('users')
        .select('organization_id, role')
        .eq('id', user.id)
        .single();

      if (!userData?.organization_id) {
        throw new Error("No organization found");
      }

      // Only owners and admins can upload logo
      if (!['owner', 'admin'].includes(userData.role)) {
        throw new Error("Permission denied");
      }

      console.log("Logo upload by user:", user.id, "for org:", userData.organization_id);

      return { 
        userId: user.id,
        organizationId: userData.organization_id 
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("Logo uploaded:", file.url);

      // Update organization with new logo URL
      const supabase = await createClient();
      await supabase
        .from('organizations')
        .update({ 
          logo_url: file.ufsUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', metadata.organizationId);

      return { 
        uploadedBy: metadata.userId,
        fileUrl: file.url 
      };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof ourFileRouter;