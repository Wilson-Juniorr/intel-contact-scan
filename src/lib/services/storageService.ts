import { supabase } from "@/integrations/supabase/client";

export const storageService = {
  download: (bucket: string, filePath: string) =>
    supabase.storage.from(bucket).download(filePath),

  upload: (bucket: string, filePath: string, file: File) =>
    supabase.storage.from(bucket).upload(filePath, file),

  createSignedUrl: (bucket: string, filePath: string, expiresIn = 60 * 60 * 24 * 7) =>
    supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn),

  downloadAndCreateUrl: async (bucket: string, filePath: string) => {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error) throw error;
    return URL.createObjectURL(data);
  },
};
