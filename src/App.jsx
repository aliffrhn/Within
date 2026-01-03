import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Sparkles, UploadCloud } from 'lucide-react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DEFAULT_LANGUAGE_OPTIONS = [
  { value: 'auto', label: 'Auto detect' },
  { value: 'en', label: 'English' },
  { value: 'id', label: 'Bahasa Indonesia' },
];

const DEFAULT_MODEL_OPTIONS = [
  { value: 'tiny', label: 'Tiny', description: 'Fastest, lowest accuracy.' },
  { value: 'base', label: 'Base', description: 'Fast with better accuracy.' },
  { value: 'small', label: 'Small', description: 'Balanced speed and quality.' },
  { value: 'medium', label: 'Medium', description: 'Solid accuracy on most devices.' },
  { value: 'large-v3', label: 'Large v3', description: 'Best accuracy, slowest.' },
];

const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm'];
const ACCEPTED_AUDIO_TYPES = [
  '.mp3',
  '.wav',
  '.m4a',
  '.flac',
  '.ogg',
  '.webm',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
].join(',');
const UNSUPPORTED_FILE_MESSAGE = 'Unsupported file type. Choose MP3, WAV, M4A, FLAC, OGG, or WEBM.';

const KEY_STORAGE_ID = 'recall-openai-key';
const API_BASE = import.meta.env.VITE_API_BASE || '';

const apiUrl = (path) => `${API_BASE}${path}`;

const parseSummaryItems = (summary) => {
  return summary
    .split(/\n+/)
    .map((line) => line.replace(/^[-*\s]+/, '').trim())
    .filter(Boolean);
};

function App() {
  const [languageOptions, setLanguageOptions] = useState(DEFAULT_LANGUAGE_OPTIONS);
  const [modelOptions, setModelOptions] = useState(DEFAULT_MODEL_OPTIONS);
  const [selectedModel, setSelectedModel] = useState('medium');
  const [recommendedModel, setRecommendedModel] = useState('medium');
  const [selectedLanguage, setSelectedLanguage] = useState('auto');
  const [maxUploadMb, setMaxUploadMb] = useState(40);
  const [audioFile, setAudioFile] = useState(null);
  const [status, setStatus] = useState({ message: '', type: '' });
  const [progressState, setProgressState] = useState({ visible: false, value: 0, label: '' });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [configReady, setConfigReady] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [segments, setSegments] = useState([]);
  const [transcriptLanguage, setTranscriptLanguage] = useState(null);
  const [copyTranscriptLabel, setCopyTranscriptLabel] = useState('Copy transcript');
  const [copyTimestampLabel, setCopyTimestampLabel] = useState('Copy transcript + timestamps');
  const [openaiKey, setOpenaiKey] = useState('');
  const [hasDefaultOpenai, setHasDefaultOpenai] = useState(false);
  const [summaryItems, setSummaryItems] = useState([]);
  const [summaryRaw, setSummaryRaw] = useState('');
  const [summaryModel, setSummaryModel] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryTriggerLabel, setSummaryTriggerLabel] = useState('Generate summary');
  const [copySummaryLabel, setCopySummaryLabel] = useState('Copy summary');
  const fileInputRef = useRef(null);
  const progressTimer = useRef(null);
  const progressHideTimer = useRef(null);

  const validateAudioFile = (file) => {
    if (!file) {
      return { ok: false, message: 'Choose an audio file first.' };
    }

    const nameParts = file.name?.split('.') || [];
    const extension = nameParts.length > 1 ? `.${nameParts.pop().toLowerCase()}` : '';
    const isSupportedExtension = SUPPORTED_AUDIO_EXTENSIONS.includes(extension);
    const mimeType = (file.type || '').toLowerCase();
    const looksLikeAudio = mimeType ? mimeType.startsWith('audio/') : true;

    if (!isSupportedExtension || !looksLikeAudio) {
      return { ok: false, message: UNSUPPORTED_FILE_MESSAGE };
    }

    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > maxUploadMb) {
      return { ok: false, message: `File exceeds ${maxUploadMb} MB limit.` };
    }

    return { ok: true };
  };

  const hasSummaryKey = hasDefaultOpenai || Boolean(openaiKey.trim());

  useEffect(() => {
    const storedKey = window.localStorage?.getItem(KEY_STORAGE_ID) || '';
    if (storedKey) {
      setOpenaiKey(storedKey);
    }
  }, []);

  useEffect(() => {
    if (!window.localStorage) return;
    if (openaiKey.trim()) {
      window.localStorage.setItem(KEY_STORAGE_ID, openaiKey.trim());
    } else {
      window.localStorage.removeItem(KEY_STORAGE_ID);
    }
  }, [openaiKey]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch(apiUrl('/config'));
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load configuration');
        }
        if (Array.isArray(data.languageOptions)) {
          setLanguageOptions(data.languageOptions);
          const defaultLanguage = data.defaultLanguage || 'auto';
          setSelectedLanguage(defaultLanguage);
        }
        if (Array.isArray(data.modelOptions)) {
          setModelOptions(data.modelOptions);
        }
        if (data.defaultModel) {
          setSelectedModel(data.defaultModel);
        }
        if (data.recommendedModel) {
          setRecommendedModel(data.recommendedModel);
        }
        if (typeof data.maxUploadMb === 'number') {
          setMaxUploadMb(data.maxUploadMb);
        }
        setHasDefaultOpenai(Boolean(data.hasDefaultOpenai));
        setConfigReady(true);
      } catch (error) {
        setStatus({ message: error.message, type: 'error' });
        setConfigReady(true);
      }
    };

    fetchConfig();
  }, []);

  const statusClass = useMemo(() => {
    if (status.type === 'error') return 'text-destructive';
    if (status.type === 'success') return 'text-emerald-400';
    if (status.type === 'info') return 'text-muted-foreground';
    return 'text-muted-foreground';
  }, [status.type]);

  const selectedModelOption = useMemo(() => {
    return modelOptions.find((option) => option.value === selectedModel);
  }, [modelOptions, selectedModel]);

  const progressLabel = progressState.label;

  const clearProgress = () => {
    if (progressTimer.current) {
      window.clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    if (progressHideTimer.current) {
      window.clearTimeout(progressHideTimer.current);
      progressHideTimer.current = null;
    }
    setProgressState({ visible: false, value: 0, label: '' });
  };

  const startProgress = (label) => {
    clearProgress();
    setProgressState({ visible: true, value: 0, label });
    let current = 0;
    progressTimer.current = window.setInterval(() => {
      current = Math.min(current + Math.random() * 10, 92);
      setProgressState((prev) => ({ ...prev, value: current }));
    }, 450);
  };

  const finishProgress = (label) => {
    setProgressState((prev) => ({ ...prev, value: 100, label }));
    if (progressTimer.current) {
      window.clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
    if (progressHideTimer.current) {
      window.clearTimeout(progressHideTimer.current);
    }
    progressHideTimer.current = window.setTimeout(() => {
      setProgressState({ visible: false, value: 0, label: '' });
      progressHideTimer.current = null;
    }, 650);
  };

  const resetSummaryState = (noteOverride = '') => {
    setSummaryItems([]);
    setSummaryRaw('');
    setSummaryModel('');
    setSummaryLoading(false);
    setSummaryTriggerLabel('Generate summary');
    setCopySummaryLabel('Copy summary');
    if (noteOverride) {
      setStatus({ message: noteOverride, type: 'info' });
    }
  };

  const summaryNote = useMemo(() => {
    if (summaryLoading) {
      return 'Generating summary...';
    }
    if (summaryModel) {
      return `Powered by ${summaryModel}`;
    }
    if (hasSummaryKey) {
      return 'Ready to generate summary.';
    }
    return 'Add your OpenAI key to enable summaries.';
  }, [hasSummaryKey, summaryLoading, summaryModel]);

  const keyButtonLabel = hasSummaryKey ? 'OpenAI key' : 'Add OpenAI key';

  const handleTranscribe = async (event) => {
    event.preventDefault();
    if (!audioFile) {
      setStatus({ message: 'Choose an audio file first.', type: 'error' });
      return;
    }
    const validation = validateAudioFile(audioFile);
    if (!validation.ok) {
      setStatus({ message: validation.message, type: 'error' });
      return;
    }

    setIsTranscribing(true);
    setStatus({ message: 'Preparing audio and transcribing locally...', type: 'info' });
    startProgress('Processing audio locally...');

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('language', selectedLanguage);
    formData.append('model', selectedModel);

    try {
      const response = await fetch(apiUrl('/transcribe'), {
        method: 'POST',
        body: formData,
      });
      setProgressState((prev) => ({ ...prev, label: 'Transcribing locally...' }));
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to transcribe file');
      }

      finishProgress('Transcription complete');
      setTranscript(data.text || '[No speech detected]');
      setSegments(Array.isArray(data.segments) ? data.segments : []);
      setTranscriptLanguage(data.language || selectedLanguage);
      setStatus({ message: 'Transcription complete', type: 'success' });
      setCopyTranscriptLabel('Copy transcript');
      setCopyTimestampLabel('Copy transcript + timestamps');
      resetSummaryState();
    } catch (error) {
      clearProgress();
      setStatus({ message: error.message, type: 'error' });
      setTranscript('');
      setSegments([]);
      setTranscriptLanguage(null);
      resetSummaryState();
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleCopyTranscript = async () => {
    if (!transcript.trim()) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopyTranscriptLabel('Copied!');
      window.setTimeout(() => setCopyTranscriptLabel('Copy transcript'), 1500);
    } catch {
      setStatus({ message: 'Unable to copy transcript.', type: 'error' });
    }
  };

  const buildTimestampedTranscript = () => {
    if (!segments.length) {
      return transcript;
    }
    return segments
      .map((segment) => {
        return `${formatTimestamp(segment.start)} to ${formatTimestamp(segment.end)}: ${segment.text}`;
      })
      .join('\n');
  };

  const handleCopyTranscriptWithTimestamps = async () => {
    if (!transcript.trim()) return;
    try {
      await navigator.clipboard.writeText(buildTimestampedTranscript());
      setCopyTimestampLabel('Copied!');
      window.setTimeout(() => setCopyTimestampLabel('Copy transcript + timestamps'), 1500);
    } catch {
      setStatus({ message: 'Unable to copy transcript with timestamps.', type: 'error' });
    }
  };

  const handleSummary = async () => {
    if (!transcript.trim()) {
      setStatus({ message: 'Transcribe a file before requesting a summary.', type: 'error' });
      return;
    }
    if (!hasSummaryKey) {
      setStatus({ message: 'Add an OpenAI key to enable summaries.', type: 'info' });
      return;
    }

    setSummaryLoading(true);
    setSummaryTriggerLabel('Summarizing...');

    try {
      const response = await fetch(apiUrl('/summarize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transcript,
          language: transcriptLanguage,
          openai_api_key: openaiKey.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to summarize transcript');
      }

      const raw = data.summary || '';
      setSummaryRaw(raw);
      const items = parseSummaryItems(raw);
      setSummaryItems(items.length ? items : [raw || 'No summary returned.']);
      setSummaryModel(data.summary_model || 'OpenAI');
      setSummaryTriggerLabel('Regenerate summary');
      setCopySummaryLabel('Copy summary');
      setStatus({ message: 'Summary ready', type: 'success' });
    } catch (error) {
      setSummaryRaw('');
      setSummaryItems([]);
      setSummaryModel('');
      setSummaryTriggerLabel('Generate summary');
      setCopySummaryLabel('Copy summary');
      setStatus({ message: error.message, type: 'error' });
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleCopySummary = async () => {
    if (!summaryRaw.trim()) return;
    try {
      await navigator.clipboard.writeText(summaryRaw);
      setCopySummaryLabel('Copied!');
      window.setTimeout(() => setCopySummaryLabel('Copy summary'), 1500);
    } catch {
      setStatus({ message: 'Unable to copy summary.', type: 'error' });
    }
  };

  const formatTimestamp = (value) => {
    if (value === null || value === undefined) return '--';
    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) return '--';
    return `${numberValue.toFixed(2)}s`;
  };

  const hasSegments = segments.length > 0;

  const transcriptPanel = (
    <div
      className="max-h-[320px] overflow-y-auto rounded-md border border-border bg-muted/60 p-4 text-base leading-7 text-foreground whitespace-pre-wrap break-words font-sans"
      role="textbox"
      aria-readonly="true"
      tabIndex={0}
      aria-label="Transcribed meeting text"
    >
      {transcript}
    </div>
  );

  return (
    <div className="min-h-screen">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12">
        <section className="space-y-4">
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Within</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Local meeting transcription with timestamps. Your audio stays on your machine. Optional recaps when you need them.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/85">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/35 px-3 py-1">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="inline-flex items-center gap-1">
                <span>Runs fully on-device with</span>
                <a
                  href="https://openai.com/index/whisper/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  Whisper
                </a>
              </span>
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/35 px-3 py-1">
              <UploadCloud className="h-4 w-4 text-accent" />
              Audio never leaves your machine
            </span>
          </div>
        </section>

        <Card className="border-border/70 bg-card/80 shadow-lg backdrop-blur">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <CardTitle>Upload a recording</CardTitle>
              <CardDescription>
                MP3, WAV, M4A, FLAC, OGG, or WEBM up to {maxUploadMb} MB.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-secondary/70 text-secondary-foreground">
              Max {maxUploadMb} MB
            </Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            <form className="grid gap-4" onSubmit={handleTranscribe}>
              <div className="grid gap-2">
                <Label htmlFor="audio">Audio file</Label>
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                  <Input
                    id="audio"
                    type="file"
                    accept={ACCEPTED_AUDIO_TYPES}
                    className="sr-only"
                    ref={fileInputRef}
                    aria-describedby="audio-file-name"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      if (!file) {
                        setAudioFile(null);
                        return;
                      }
                      const validation = validateAudioFile(file);
                      if (!validation.ok) {
                        setAudioFile(null);
                        setStatus({ message: validation.message, type: 'error' });
                        event.target.value = '';
                        return;
                      }
                      setAudioFile(file);
                      if (status.type === 'error') {
                        setStatus({ message: '', type: '' });
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose file
                  </Button>
                  <span
                    id="audio-file-name"
                    className="text-sm text-muted-foreground"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {audioFile?.name || 'No file chosen'}
                  </span>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="language">Language preference</Label>
                <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                  <SelectTrigger id="language" aria-describedby="language-hint">
                    <SelectValue placeholder="Auto detect" />
                  </SelectTrigger>
                  <SelectContent>
                    {languageOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="language-hint" className="text-xs text-muted-foreground">
                  Use manual language if the meeting stayed in one tongue.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="model">Model</Label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger id="model" aria-describedby="model-hint">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                        {option.value === recommendedModel ? ' (recommended)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="model-hint" className="text-xs text-muted-foreground">
                  {configReady
                    ? selectedModelOption?.description || 'Pick the speed and accuracy that fits your hardware.'
                    : ''}
                </p>
              </div>
              <Button type="submit" disabled={isTranscribing || !audioFile}>
                {isTranscribing ? 'Transcribing...' : 'Transcribe recording'}
              </Button>
            </form>

            {progressState.visible ? (
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{progressLabel}</p>
                <Progress value={progressState.value} />
              </div>
            ) : null}

            <div className={`text-sm ${statusClass}`} role="status" aria-live="polite" aria-atomic="true">
              {status.message}
            </div>
          </CardContent>
        </Card>

        {transcript ? (
          <Card className="border-border/70 bg-card/80 shadow-lg backdrop-blur">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <CardTitle>Transcript</CardTitle>
                <CardDescription>
                  Structured transcript with timestamps for review, editing, and export.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyTranscript}>
                  <Copy className="h-4 w-4" />
                  {copyTranscriptLabel}
                </Button>
                <Button variant="secondary" size="sm" onClick={handleCopyTranscriptWithTimestamps}>
                  <Copy className="h-4 w-4" />
                  {copyTimestampLabel}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasSegments ? (
                <>
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Timestamped segments
                    </p>
                    <div className="max-h-[360px] overflow-y-auto rounded-md border border-border bg-muted/60 p-3">
                      <ul className="space-y-3">
                        {segments.map((segment, index) => (
                          <li
                            key={`${segment.start}-${segment.end}-${index}`}
                            className="rounded-md border border-border/70 bg-background/40 p-3"
                          >
                            <div className="text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
                              {formatTimestamp(segment.start)} to {formatTimestamp(segment.end)}
                            </div>
                            <div className="mt-2 text-sm leading-relaxed text-foreground">
                              {segment.text}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <Accordion type="single" collapsible className="rounded-md border border-border bg-secondary/60 px-4">
                    <AccordionItem value="transcript">
                      <AccordionTrigger>Show full transcript</AccordionTrigger>
                      <AccordionContent>{transcriptPanel}</AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </>
              ) : (
                transcriptPanel
              )}
            </CardContent>
          </Card>
        ) : null}

        {transcript ? (
          <Card className="border-border/70 bg-card/80 shadow-lg backdrop-blur">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>AI summary</CardTitle>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                <CardDescription>Generate bullet notes from your transcript.</CardDescription>
              </div>
              <div className="flex flex-col items-start gap-2 md:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        {keyButtonLabel}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>OpenAI key</DialogTitle>
                        <DialogDescription>
                          {hasDefaultOpenai
                            ? 'Server default is available. Add your own key if you want to override it.'
                            : 'Paste an sk- key here. It is stored locally and sent only when you request a summary.'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-3">
                        <Label htmlFor="openai-key">OpenAI API key</Label>
                        <Input
                          id="openai-key"
                          type="password"
                          placeholder="sk-..."
                          value={openaiKey}
                          onChange={(event) => setOpenaiKey(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {openaiKey.trim()
                            ? 'Key saved locally for summaries.'
                            : 'No key stored. Add one to enable AI summaries.'}
                        </p>
                      </div>
                      <DialogFooter>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => setOpenaiKey('')}
                        >
                          Remove key
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button size="sm" onClick={handleSummary} disabled={!hasSummaryKey || summaryLoading}>
                    {summaryTriggerLabel}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
                  {summaryNote}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Summary</p>
                {summaryRaw.trim() ? (
                  <Button variant="outline" size="sm" onClick={handleCopySummary}>
                    <Copy className="h-4 w-4" />
                    {copySummaryLabel}
                  </Button>
                ) : null}
              </div>
              {summaryItems.length ? (
                <ul className="list-disc space-y-2 pl-5 text-sm text-foreground" aria-live="polite">
                  {summaryItems.map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-md border border-dashed border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                  Summary will appear here after generation.
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}

export default App;
