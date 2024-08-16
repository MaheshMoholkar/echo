export default async function convertImageToBase64(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image from ${url}`);
  }

  const blob = await response.blob();
  const reader = new FileReader();

  // Return a Promise directly while waiting for the reader to finish
  const base64String = await new Promise<string>((resolve, reject) => {
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1]; // Extract base64 part
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });

  return base64String;
}
