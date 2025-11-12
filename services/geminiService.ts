import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { ReferenceImage, AspectRatio } from "../types";

const getAi = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is not configured. The app cannot connect to the AI service. Please ensure the API_KEY environment variable is set.");
  }
  return new GoogleGenAI({ apiKey });
};

const promptGenerationModel = "gemini-2.5-flash";
const imageGenerationModelWithRef = "gemini-2.5-flash-image";
const imageGenerationModelNoRef = "imagen-4.0-generate-001";

const PROMPT_GENERATION_SYSTEM_INSTRUCTION = `You are an expert script analyst and creative director. Your job is to read a script, break it down into key visual moments, and generate concise, detailed prompts for a text-to-image AI. Each prompt should describe a single, clear scene. Ensure the prompts are diverse and capture the essence of the script. Return the output as a JSON array of strings.`;

export async function generatePromptsFromScript(script: string): Promise<string[]> {
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: promptGenerationModel,
      contents: script,
      config: {
        systemInstruction: PROMPT_GENERATION_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            description: "A single, detailed visual prompt for an image generation AI.",
          },
        },
      },
    });
    
    const prompts = JSON.parse(response.text);
    if (!Array.isArray(prompts)) {
      throw new Error("AI did not return a valid array of prompts.");
    }
    return prompts.filter(p => typeof p === 'string' && p.trim() !== '');

  } catch (error) {
    console.error("Error generating prompts:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("An unknown error occurred while generating prompts.");
  }
}

export async function generateImageFromPrompt(
  prompt: string,
  styleKeywords: string,
  referenceImage: ReferenceImage | null,
  aspectRatio: AspectRatio
): Promise<string> {
  try {
    const ai = getAi();
    const stylePrompt = styleKeywords ? `, in the style of ${styleKeywords}` : '';

    if (referenceImage) {
      // Use gemini-2.5-flash-image for image-to-image.
      // Aspect ratio is passed via text prompt, which may have limited effect.
      let ratioPrompt = '';
      if (aspectRatio === '9:16') {
          ratioPrompt = ', vertical 9:16 aspect ratio';
      } else if (aspectRatio === '16:9') {
          ratioPrompt = ', horizontal 16:9 aspect ratio';
      }
      const fullPrompt = `${prompt}${stylePrompt}${ratioPrompt}`;

      const parts: any[] = [{ text: fullPrompt }];
      parts.unshift({
        inlineData: {
          data: referenceImage.base64,
          mimeType: referenceImage.file.type,
        },
      });

      const response = await ai.models.generateContent({
        model: imageGenerationModelWithRef,
        contents: { parts },
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
      throw new Error("No image data found in the response for image-to-image generation.");

    } else {
      // Use imagen-4.0-generate-001 for text-to-image with explicit aspect ratio support.
      const fullPrompt = `${prompt}${stylePrompt}`;
      
      const response = await ai.models.generateImages({
          model: imageGenerationModelNoRef,
          prompt: fullPrompt,
          config: {
            numberOfImages: 1,
            aspectRatio: aspectRatio,
            outputMimeType: 'image/png',
          },
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        return `data:image/png;base64,${base64ImageBytes}`;
      }
      throw new Error("No image data found in the response for text-to-image generation.");
    }
  } catch (error) {
    console.error(`Error generating image for prompt "${prompt}":`, error);
    if (error instanceof Error) {
        throw new Error(`Failed for prompt "${prompt}": ${error.message}`);
    }
    throw new Error(`An unknown error occurred for prompt: "${prompt}".`);
  }
}
