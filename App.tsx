import React, { useState, useCallback } from 'react';
import { generatePromptsFromScript, generateImageFromPrompt } from './services/geminiService';
import type { GeneratedImage, ReferenceImage, AspectRatio } from './types';

// SVG Icons defined outside component to prevent re-creation on re-renders
const SpinnerIcon = () => (
    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const FileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const App: React.FC = () => {
    const [script, setScript] = useState<string>('');
    const [styleKeywords, setStyleKeywords] = useState<string>('');
    const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [prompts, setPrompts] = useState<string[]>([]);
    const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
    const [isLoadingPrompts, setIsLoadingPrompts] = useState<boolean>(false);
    const [isLoadingImages, setIsLoadingImages] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [imageGenerationProgress, setImageGenerationProgress] = useState(0);

    const fileToBase64 = (file: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = (error) => reject(error);
      });
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            try {
                const base64 = await fileToBase64(file);
                setReferenceImage({ file, base64 });
            } catch (err) {
                setError("Failed to read the reference image file.");
                console.error(err);
            }
        }
    };

    const handleGeneratePrompts = useCallback(async () => {
        if (!script) {
            setError('Please provide a script first.');
            return;
        }
        setIsLoadingPrompts(true);
        setError(null);
        setPrompts([]);
        setGeneratedImages([]);
        try {
            const result = await generatePromptsFromScript(script);
            setPrompts(result);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoadingPrompts(false);
        }
    }, [script]);

    const handleGenerateImages = useCallback(async () => {
        if (prompts.length === 0) {
            setError('Please generate prompts before generating images.');
            return;
        }
        setIsLoadingImages(true);
        setError(null);
        setGeneratedImages([]);
        setImageGenerationProgress(0);

        const newImages: GeneratedImage[] = [];
        for (let i = 0; i < prompts.length; i++) {
            const prompt = prompts[i];
            try {
                const imageUrl = await generateImageFromPrompt(prompt, styleKeywords, referenceImage, aspectRatio);
                const newImage = { prompt, src: imageUrl };
                newImages.push(newImage);
                setGeneratedImages([...newImages]);
            } catch (err: any) {
                console.error(err.message);
                // Continue generating other images even if one fails
            }
            setImageGenerationProgress(i + 1);
        }

        setIsLoadingImages(false);
    }, [prompts, styleKeywords, referenceImage, aspectRatio]);

    const handleDownloadAll = useCallback(() => {
        if (generatedImages.length === 0) return;
        // @ts-ignore - JSZip is loaded from CDN
        const zip = new window.JSZip();
        
        generatedImages.forEach((image, index) => {
            const imgData = image.src.split(',')[1];
            // Sanitize prompt to create a valid filename
            const fileName = `${(index + 1).toString().padStart(3, '0')}_${image.prompt.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.png`;
            zip.file(fileName, imgData, { base64: true });
        });

        zip.generateAsync({ type: 'blob' }).then(content => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'generated_images.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

    }, [generatedImages]);


    return (
        <div className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="text-center mb-10">
                    <h1 className="text-4xl sm:text-5xl font-bold text-text-main">Bulk AI Image Generator</h1>
                    <p className="text-lg text-text-secondary mt-2">Your AI-powered script-to-image studio</p>
                </header>

                {error && (
                    <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg relative mb-6" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}
                
                <main className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Inputs */}
                    <div className="flex flex-col gap-8">
                        <div className="bg-card p-6 rounded-lg border border-border shadow-lg">
                            <h2 className="text-xl font-semibold mb-4 text-text-main flex items-center">
                                <span className="bg-primary text-white rounded-full h-8 w-8 flex items-center justify-center mr-3 font-bold text-sm">1</span>
                                Provide Content
                            </h2>
                            <textarea
                                value={script}
                                onChange={(e) => setScript(e.target.value)}
                                placeholder="Paste your script, story, or long text here..."
                                className="w-full h-60 p-3 bg-secondary border border-border rounded-md focus:ring-2 focus:ring-primary focus:outline-none transition-all text-text-secondary placeholder:text-gray-500"
                            />
                            <button
                                onClick={handleGeneratePrompts}
                                disabled={isLoadingPrompts || !script}
                                className="mt-4 w-full bg-primary text-white font-bold py-2 px-4 rounded-md hover:bg-primary-hover disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                            >
                                {isLoadingPrompts ? <><SpinnerIcon /> Generating Prompts...</> : 'Generate Prompts'}
                            </button>
                        </div>

                        <div className="bg-card p-6 rounded-lg border border-border shadow-lg">
                            <h2 className="text-xl font-semibold mb-4 text-text-main flex items-center">
                                <span className="bg-primary text-white rounded-full h-8 w-8 flex items-center justify-center mr-3 font-bold text-sm">2</span>
                                Define Image Style (Optional)
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1" htmlFor="style-keywords">Style Keywords</label>
                                    <input
                                        type="text"
                                        id="style-keywords"
                                        value={styleKeywords}
                                        onChange={(e) => setStyleKeywords(e.target.value)}
                                        placeholder="e.g., cinematic, hyperrealistic, watercolor"
                                        className="w-full p-3 bg-secondary border border-border rounded-md focus:ring-2 focus:ring-primary focus:outline-none transition-all text-text-secondary placeholder:text-gray-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-2">Aspect Ratio</label>
                                    <div className="flex space-x-2 rounded-md bg-secondary p-1">
                                        {(['1:1', '9:16', '16:9'] as AspectRatio[]).map(ratio => (
                                            <button
                                                key={ratio}
                                                onClick={() => setAspectRatio(ratio)}
                                                className={`w-full rounded py-2 px-3 text-sm font-semibold transition-colors ${
                                                    aspectRatio === ratio
                                                        ? 'bg-primary text-white'
                                                        : 'text-text-secondary hover:bg-border'
                                                }`}
                                            >
                                                {ratio}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-text-secondary mb-1" htmlFor="ref-image">Reference Image</label>
                                    <input
                                        type="file"
                                        id="ref-image"
                                        accept="image/*"
                                        onChange={handleFileChange}
                                        className="w-full text-sm text-text-secondary file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-hover file:cursor-pointer"
                                    />
                                    {referenceImage && (
                                        <>
                                            <div className="mt-2 text-sm text-green-400 flex items-center">
                                                <FileIcon />
                                                {referenceImage.file.name}
                                            </div>
                                            <p className="mt-1 text-xs text-text-secondary">Note: The selected aspect ratio may not apply when a reference image is used.</p>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Outputs */}
                    <div className="flex flex-col gap-8">
                        <div className="bg-card p-6 rounded-lg border border-border shadow-lg">
                            <h2 className="text-xl font-semibold mb-2 text-text-main">Generated Prompts ({prompts.length})</h2>
                            {prompts.length > 0 ? (
                                <>
                                    <div className="max-h-60 overflow-y-auto space-y-2 p-3 bg-secondary rounded-md border border-border">
                                        {prompts.map((p, i) => (
                                            <p key={i} className="text-sm text-text-secondary border-b border-border/50 pb-1">{i + 1}. {p}</p>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleGenerateImages}
                                        disabled={isLoadingImages || prompts.length === 0}
                                        className="mt-4 w-full bg-green-600 text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                                    >
                                        {isLoadingImages ? <><SpinnerIcon /> Generating Images...</> : 'Generate Images'}
                                    </button>
                                </>
                            ) : (
                                <p className="text-text-secondary italic">Prompts will appear here after generation.</p>
                            )}
                        </div>
                        
                        <div className="bg-card p-6 rounded-lg border border-border shadow-lg">
                             <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold text-text-main">Generated Images ({generatedImages.length}/{prompts.length})</h2>
                                <button
                                    onClick={handleDownloadAll}
                                    disabled={isLoadingImages || generatedImages.length === 0}
                                    className="bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors text-sm"
                                >
                                    Download All
                                </button>
                             </div>
                            
                            {isLoadingImages && (
                                <div className="w-full bg-secondary rounded-full h-2.5 mb-4">
                                    <div className="bg-primary h-2.5 rounded-full" style={{ width: `${(imageGenerationProgress / prompts.length) * 100}%` }}></div>
                                </div>
                            )}

                             {generatedImages.length > 0 ? (
                                 <div className="max-h-[600px] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-4">
                                     {generatedImages.map((image, i) => (
                                         <div key={i} className="group relative rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all">
                                             <img src={image.src} alt={image.prompt} className="w-full h-auto object-cover" />
                                             <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-xs text-white overflow-hidden">
                                                 {image.prompt}
                                             </div>
                                         </div>
                                     ))}
                                 </div>
                             ) : (
                                 <div className="flex items-center justify-center h-40 bg-secondary rounded-lg">
                                    <p className="text-text-secondary italic">Images will appear here.</p>
                                 </div>
                             )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default App;
