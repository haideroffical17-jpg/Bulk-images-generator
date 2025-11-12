import React, { useState, useCallback, useMemo } from 'react';
import { generatePromptsFromScript, generateImageFromPrompt } from './services/geminiService.ts';
import type { ReferenceImage, AspectRatio } from './types.ts';

type ImageJobStatus = 'pending' | 'generating' | 'success' | 'failed';

interface ImageJob {
  prompt: string;
  status: ImageJobStatus;
  src?: string;
  error?: string;
}

// SVG Icons defined outside component to prevent re-creation on re-renders
const SpinnerIcon = () => (
    <svg className="animate-spin h-8 w-8 text-white" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const FileIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

const ErrorIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const ClockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);


const App: React.FC = () => {
    const [script, setScript] = useState<string>('');
    const [styleKeywords, setStyleKeywords] = useState<string>('');
    const [referenceImage, setReferenceImage] = useState<ReferenceImage | null>(null);
    const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
    const [imageJobs, setImageJobs] = useState<ImageJob[]>([]);
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
        setImageJobs([]);
        try {
            const result = await generatePromptsFromScript(script);
            setImageJobs(result.map(prompt => ({ prompt, status: 'pending' })));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoadingPrompts(false);
        }
    }, [script]);

    const jobsToProcess = useMemo(() => 
        imageJobs
            .map((job, index) => ({...job, originalIndex: index}))
            .filter(job => job.status === 'pending' || job.status === 'failed'),
    [imageJobs]);

    const handleGenerateImages = useCallback(async () => {
        if (jobsToProcess.length === 0) {
            setError('No images to generate or retry.');
            return;
        }
        setIsLoadingImages(true);
        setError(null);
        setImageGenerationProgress(0);

        for (let i = 0; i < jobsToProcess.length; i++) {
            const { prompt, originalIndex } = jobsToProcess[i];
            
            setImageJobs(prevJobs => {
                const newJobs = [...prevJobs];
                newJobs[originalIndex] = { ...newJobs[originalIndex], status: 'generating', error: undefined };
                return newJobs;
            });

            try {
                const imageUrl = await generateImageFromPrompt(prompt, styleKeywords, referenceImage, aspectRatio);
                setImageJobs(prevJobs => {
                    const newJobs = [...prevJobs];
                    newJobs[originalIndex] = { ...newJobs[originalIndex], status: 'success', src: imageUrl };
                    return newJobs;
                });
            } catch (err: any) {
                console.error(err.message);
                setImageJobs(prevJobs => {
                    const newJobs = [...prevJobs];
                    newJobs[originalIndex] = { ...newJobs[originalIndex], status: 'failed', error: err.message };
                    return newJobs;
                });
            }
            setImageGenerationProgress(i + 1);
        }

        setIsLoadingImages(false);
    }, [jobsToProcess, styleKeywords, referenceImage, aspectRatio]);

    const successfulImages = useMemo(() => imageJobs.filter(job => job.status === 'success' && job.src), [imageJobs]);

    const handleDownloadAll = useCallback(() => {
        if (successfulImages.length === 0) return;
        // @ts-ignore - JSZip is loaded from CDN
        const zip = new window.JSZip();
        
        successfulImages.forEach((image, index) => {
            const imgData = image.src!.split(',')[1];
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

    }, [successfulImages]);

    const hasFailedJobs = useMemo(() => imageJobs.some(j => j.status === 'failed'), [imageJobs]);
    const hasPendingJobs = useMemo(() => imageJobs.some(j => j.status === 'pending'), [imageJobs]);
    
    const getGenerateButtonText = () => {
        if (isLoadingImages) return 'Generating Images...';
        if (hasFailedJobs && !hasPendingJobs) return 'Retry Failed Images';
        return 'Generate Images';
    };

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
                            <h2 className="text-xl font-semibold mb-2 text-text-main">Generated Prompts ({imageJobs.length})</h2>
                            {imageJobs.length > 0 ? (
                                <>
                                    <div className="max-h-60 overflow-y-auto space-y-2 p-3 bg-secondary rounded-md border border-border">
                                        {imageJobs.map((job, i) => (
                                            <p key={i} className="text-sm text-text-secondary border-b border-border/50 pb-1">{i + 1}. {job.prompt}</p>
                                        ))}
                                    </div>
                                    <button
                                        onClick={handleGenerateImages}
                                        disabled={isLoadingImages || jobsToProcess.length === 0}
                                        className={`mt-4 w-full text-white font-bold py-2 px-4 rounded-md transition-colors flex items-center justify-center ${
                                            hasFailedJobs && !hasPendingJobs ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'
                                        } disabled:bg-gray-600 disabled:cursor-not-allowed`}
                                    >
                                        {isLoadingImages ? <><SpinnerIcon /> {getGenerateButtonText()}</> : getGenerateButtonText()}
                                    </button>
                                </>
                            ) : (
                                <p className="text-text-secondary italic">Prompts will appear here after generation.</p>
                            )}
                        </div>
                        
                        <div className="bg-card p-6 rounded-lg border border-border shadow-lg">
                             <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-semibold text-text-main">Generated Images ({successfulImages.length}/{imageJobs.length})</h2>
                                <button
                                    onClick={handleDownloadAll}
                                    disabled={isLoadingImages || successfulImages.length === 0}
                                    className="bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors text-sm"
                                >
                                    Download All
                                </button>
                             </div>
                            
                            {isLoadingImages && jobsToProcess.length > 0 && (
                                <div className="w-full bg-secondary rounded-full h-2.5 mb-4">
                                    <div className="bg-primary h-2.5 rounded-full" style={{ width: `${(imageGenerationProgress / jobsToProcess.length) * 100}%` }}></div>
                                </div>
                            )}

                            {imageJobs.length > 0 ? (
                                <div className="max-h-[600px] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {imageJobs.map((job, i) => (
                                        <div key={i} className="group relative rounded-lg overflow-hidden border-2 border-border bg-secondary flex items-center justify-center aspect-square">
                                            {job.status === 'success' && job.src ? (
                                                <>
                                                    <img src={job.src} alt={job.prompt} className="w-full h-full object-cover" />
                                                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-xs text-white flex items-center justify-center text-center">
                                                        {job.prompt}
                                                    </div>
                                                </>
                                            ) : job.status === 'generating' ? (
                                                <div className="flex flex-col items-center gap-2 text-text-secondary">
                                                    <SpinnerIcon />
                                                    <span className="text-xs">Generating...</span>
                                                </div>
                                            ) : job.status === 'pending' ? (
                                                <div className="flex flex-col items-center gap-2 text-text-secondary">
                                                    <ClockIcon />
                                                    <span className="text-xs">Pending</span>
                                                </div>
                                            ) : job.status === 'failed' ? (
                                                <div className="border-red-500 border-2 w-full h-full flex flex-col items-center justify-center gap-2 p-2 text-center">
                                                    <ErrorIcon />
                                                    <span className="text-sm text-red-400">Failed</span>
                                                    <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity p-2 text-xs text-white overflow-auto flex items-center justify-center">
                                                        {job.error}
                                                    </div>
                                                </div>
                                            ) : null}
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
