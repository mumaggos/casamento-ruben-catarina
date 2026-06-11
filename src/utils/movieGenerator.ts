/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";

export interface MovieAsset {
  photos: {
    imageUrl: string;
    author: string;
    favorite: boolean;
    likesCount: number;
    createdAtMs: number;
  }[];
  writtenMessages: {
    author: string;
    text: string;
    createdAtMs: number;
  }[];
  voiceMessages: {
    author: string;
    audioUrl: string; // base64
    duration?: number;
    createdAtMs: number;
  }[];
  musicType: "none" | "synth" | "piano" | "guitar" | "custom";
  customMusicBase64?: string;
}

// Draw text cleanly with wrap
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  let line = "";
  let currentY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, currentY);
      line = words[n] + " ";
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY;
}

export const decodeAudioSource = async (
  ctx: AudioContext,
  source: string
): Promise<AudioBuffer | null> => {
  try {
    let arrayBuffer: ArrayBuffer;
    if (source.startsWith("data:")) {
      const base64 = source.split(",")[1] || source;
      const binary = atob(base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } else {
      const response = await fetch(source);
      arrayBuffer = await response.arrayBuffer();
    }
    return await ctx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.warn("Failed to decode audio source:", err);
    return null;
  }
};

export const createSynthesizedAmbientTrack = (
  audioCtx: AudioContext,
  durationSeconds: number,
  type: "piano" | "guitar"
): AudioBuffer => {
  const sampleRate = audioCtx.sampleRate || 44100;
  const numSamples = Math.ceil(sampleRate * durationSeconds);
  const buffer = audioCtx.createBuffer(2, numSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // romantic, cinematic chord list
  const progressions = {
    piano: [
      [130.81, 196.00, 261.63, 329.63, 493.88, 587.33], // Cmaj9
      [110.00, 164.81, 220.00, 293.66, 349.23, 523.25], // Am9
      [87.31, 130.81, 174.61, 261.63, 329.63, 440.00],  // Fmaj7
      [98.00, 146.83, 196.00, 246.94, 293.66, 392.00]   // G6
    ],
    guitar: [
      [110.00, 164.81, 220.00, 329.63, 392.00, 440.00], // Asus2
      [123.47, 185.00, 246.94, 311.13, 369.99, 493.88], // Bm7
      [87.31, 130.81, 174.61, 349.23, 440.00, 523.25],  // Fmaj7
      [98.00, 146.83, 196.00, 293.66, 392.00, 587.33]   // G6
    ]
  };

  const chordProg = progressions[type] || progressions.piano;
  const chordDuration = 5.0; // Seconds per chord
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    
    // Determine current chord
    const cycleIndex = Math.floor(t / chordDuration);
    const chordIndex = cycleIndex % chordProg.length;
    const notes = chordProg[chordIndex];
    const timeInChord = t % chordDuration;
    
    let sampleVal = 0;
    
    // Add notes in the chord
    for (let j = 0; j < notes.length; j++) {
      const freq = notes[j];
      
      // Delay note starters (arpeggio)
      const noteDelay = j * 0.15;
      if (timeInChord > noteDelay) {
        const noteActiveTime = timeInChord - noteDelay;
        
        // Pluck envelope: rapid attack + slow exponential decay
        const attack = 0.05;
        const decay = type === "guitar" ? 2.5 : 3.5;
        let amp = 0;
        if (noteActiveTime < attack) {
          amp = noteActiveTime / attack;
        } else {
          amp = Math.exp(-(noteActiveTime - attack) / decay);
        }
        
        // Basic voice synthesizer + soft warmth harmonics
        const phase1 = 2 * Math.PI * freq * noteActiveTime;
        const tone1 = Math.sin(phase1);
        const tone2 = 0.22 * Math.sin(phase1 * 2); // 1st Harmonic
        const tone3 = 0.08 * Math.sin(phase1 * 3);  // 2nd Harmonic
        
        sampleVal += (tone1 + tone2 + tone3) * amp * 0.12;
      }
    }
    
    // Add slow panning LFO
    const lfo = Math.sin(2 * Math.PI * 0.1 * t); 
    const leftVolume = 0.5 + 0.3 * lfo;
    const rightVolume = 0.5 - 0.3 * lfo;
    
    const limitedVal = Math.max(-0.95, Math.min(0.95, sampleVal));
    left[i] = limitedVal * leftVolume;
    right[i] = limitedVal * rightVolume;
  }
  
  return buffer;
};

export interface GenerationProgress {
  status: string;
  percent: number;
}

export const generateMemoriesMovie = async (
  assets: MovieAsset,
  canvasElement: HTMLCanvasElement,
  onProgress: (progress: GenerationProgress) => void
): Promise<string> => {
  onProgress({ status: "A inicializar o motor de vídeo...", percent: 5 });

  // 1. Prepare standard inputs
  const photos = [...assets.photos]
    .sort((a, b) => b.createdAtMs - a.createdAtMs); // Take ALL photos!
  const written = [...assets.writtenMessages]
    .sort((a, b) => b.createdAtMs - a.createdAtMs); // Take ALL written messages!
  const voices = [...assets.voiceMessages]
    .sort((a, b) => b.createdAtMs - a.createdAtMs); // Take ALL voice messages!
  // Canvas context setups - dynamically scale down resolution on mobile devices/browsers to prevent watchdog OOM reloads and maintain perfect rendering speed
  const isMobile = typeof navigator !== "undefined" && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
    (navigator.maxTouchPoints && navigator.maxTouchPoints > 2)
  );
  
  const width = isMobile ? 640 : 854; // Optimized resolutions (360p / 480p widescreen cinematic) to guarantee 100% stability, tiny file sizes, and 0% crash rate
  const height = isMobile ? 360 : 480;
  
  canvasElement.width = width;
  canvasElement.height = height;
  const ctx = canvasElement.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D canvas context");

  // 2. Preload photos with custom crossOrigin setup + cache buster to prevent cached CORS block and canvas tainting SecurityError
  onProgress({ status: "A carregar fotografias dos convidados...", percent: 15 });
  const loadedPhotos: HTMLImageElement[] = [];
  for (let i = 0; i < photos.length; i++) {
    try {
      const img = new Image();
      if (photos[i].imageUrl && !photos[i].imageUrl.startsWith("data:")) {
        img.crossOrigin = "anonymous"; // CRITICAL to avoid tainting canvas and causing MediaRecorder SecurityError on external assets
        try {
          const urlObj = new URL(photos[i].imageUrl);
          urlObj.searchParams.set("media_cors", String(Date.now() + i));
          img.src = urlObj.toString();
        } catch {
          img.src = photos[i].imageUrl + (photos[i].imageUrl.includes("?") ? "&" : "?") + "media_cors=" + (Date.now() + i);
        }
      } else {
        img.src = photos[i].imageUrl;
      }

      await new Promise((resolve) => {
        img.onload = () => {
          loadedPhotos.push(img);
          resolve(null);
        };
        img.onerror = () => {
          // If anonymous load fails, we skip this image entirely to absolutely GUARANTEE the canvas is never tainted!
          console.warn("CORS/network image preloading failed, skipped to prevent canvas tainting SecurityError:", photos[i].imageUrl);
          resolve(null); 
        };
      });
    } catch (e) {
      console.warn("Failed loading image source during movie gen:", e);
    }
  }

  // 3. Construct Timeline First (to know exact total duration for audio synthesis fallback)
  // Slide types: title-slide, photo-slide, message-slide
  interface MovieSlide {
    type: "title" | "photo" | "message" | "end";
    duration: number; // in seconds
    author?: string;
    text?: string;
    img?: HTMLImageElement;
    likes?: number;
    favorite?: boolean;
  }

  const slides: MovieSlide[] = [];
  // Title Slide
  slides.push({
    type: "title",
    duration: 5,
  });

  // Interleave photos and written messages
  let photoIdx = 0;
  let textIdx = 0;

  while (photoIdx < loadedPhotos.length || textIdx < written.length) {
    // Add 2 photos
    for (let c = 0; c < 2 && photoIdx < loadedPhotos.length; c++) {
      const pInfo = photos[photoIdx];
      slides.push({
        type: "photo",
        duration: 4.5,
        img: loadedPhotos[photoIdx],
        author: pInfo.author,
        likes: pInfo.likesCount,
        favorite: !!pInfo.favorite,
      });
      photoIdx++;
    }
    // Add 1 message slide
    if (textIdx < written.length) {
      const mInfo = written[textIdx];
      slides.push({
        type: "message",
        duration: 5,
        author: mInfo.author,
        text: mInfo.text,
      });
      textIdx++;
    }
  }

  // Ending Slide
  slides.push({
    type: "end",
    duration: 4,
  });

  // Total Duration
  const totalDuration = slides.reduce((acc, s) => acc + s.duration, 0);

  // Setup schedule for voice messages over the video timeline
  const voiceStartTimeList = [7, 18, 29, 40];


  // 4. Prepare AudioContext and Nodes
  onProgress({ status: "A configurar estúdio de mistura áudio...", percent: 30 });
  const AudioCtxVal = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioCtxVal();
  const dest = audioCtx.createMediaStreamDestination();

  // Load custom music or fallbacks
  let backgroundBuffer: AudioBuffer | null = null;
  const bgGain = audioCtx.createGain();
  bgGain.gain.setValueAtTime(0.2, audioCtx.currentTime); // Standard background volume
  bgGain.connect(dest);

  try {
    // CRITICAL iOS/Safari Fix: Connect to the physical speakers/audio destination at very low volume (1%).
    // This tricks Safari's power managers/watchdog from suspending or discarding the AudioContext output,
    // which previously led to silent video output or massive browser/tab crashes/reloads during canvas capture streams!
    const speakerVolumeNode = audioCtx.createGain();
    speakerVolumeNode.gain.setValueAtTime(0.01, audioCtx.currentTime); 
    bgGain.connect(speakerVolumeNode);
    speakerVolumeNode.connect(audioCtx.destination);
  } catch (speakerError) {
    console.warn("Failed to connect monitor output (non-fatal):", speakerError);
  }

  if (audioCtx.state === "suspended") {
    await audioCtx.resume().catch((e) => console.warn("Failed to resume AudioContext:", e));
  }

  onProgress({ status: "A descarregar banda sonora (You Are The Reason)...", percent: 40 });
  backgroundBuffer = await decodeAudioSource(
    audioCtx,
    "https://ceenaija.com/wp-content/uploads/2021/04/Calum_Scott_-_You_Are_The_Reason_CeeNaija.com_.mp3"
  );

  if (!backgroundBuffer) {
    onProgress({ status: "A descarregar banda sonora de recurso...", percent: 43 });
    backgroundBuffer = await decodeAudioSource(
      audioCtx,
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
    );
  }

  // 100% RELIABLE SYNTH FALLBACK: Bypasses network failures and CORS constraints completely
  if (!backgroundBuffer) {
    onProgress({ status: "A sintetizar banda sonora romântica em piano...", percent: 45 });
    backgroundBuffer = createSynthesizedAmbientTrack(
      audioCtx,
      totalDuration + 5,
      "piano"
    );
  }

  // Pre-decode all voice messages
  onProgress({ status: "A misturar mensagens de voz dos convidados...", percent: 50 });
  const decodedVoices: { author: string; buffer: AudioBuffer }[] = [];
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    const buffer = await decodeAudioSource(audioCtx, v.audioUrl);
    if (buffer) {
      decodedVoices.push({ author: v.author, buffer });
    }
  }

  // 5. Start canvas stream capture and MediaRecorder
  onProgress({ status: "A preparar gravação de vídeo HD...", percent: 65 });
  const canvasFPS = isMobile ? 15 : 30;
  const canvasStream = canvasElement.captureStream(canvasFPS); // Matching lower FPS on mobile to avoid crashes
  
  // Create combined stream of Canvas Video + Audio Destination
  const combinedStream = new MediaStream();
  canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));
  
  let hasAudio = false;
  try {
    dest.stream.getAudioTracks().forEach((track) => {
      combinedStream.addTrack(track);
      hasAudio = true;
    });
  } catch (audioError) {
    console.warn("Could not extract WebAudio stream output tracks:", audioError);
  }

  // Determine standard supported MediaRecorder formats (favor MP4/H264 which is 100% playable native on mobile devices like iPhone and Android)
  const preferredTypes = [
    "video/mp4;codecs=h264,aac",
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/quicktime",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  let recorderType = "";
  for (const type of preferredTypes) {
    if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type)) {
      recorderType = type;
      break;
    }
  }

  const recordedChunks: Blob[] = [];
  let recorder: MediaRecorder;
  
  try {
    recorder = recorderType 
      ? new MediaRecorder(combinedStream, { mimeType: recorderType })
      : new MediaRecorder(combinedStream);
  } catch (recorderError) {
    console.warn("Combined video+audio MediaRecorder creation failed (common on Safari iOS). Reverting to video-only track...", recorderError);
    // iOS Safari has a persistent bug recording mixed media stream destination nodes. Safe fallback is video-only capture.
    const videoOnlyStream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => videoOnlyStream.addTrack(track));
    
    let fallbackType = "";
    for (const type of ["video/mp4;codecs=h264", "video/mp4", "video/quicktime", "video/webm"]) {
      if (typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(type)) {
        fallbackType = type;
        break;
      }
    }
    
    recorder = fallbackType
      ? new MediaRecorder(videoOnlyStream, { mimeType: fallbackType })
      : new MediaRecorder(videoOnlyStream);
    hasAudio = false;
  }

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  // Promise resolved when recorder stops and yields the final Blob URL
  const recordingPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      const videoBlob = new Blob(recordedChunks, { type: recorder.mimeType || "video/webm" });
      resolve(videoBlob);
    };
  });

  // Start audio background track
  if (backgroundBuffer && hasAudio) {
    try {
      const bgSource = audioCtx.createBufferSource();
      bgSource.buffer = backgroundBuffer;
      bgSource.loop = true;
      bgSource.connect(bgGain);
      bgSource.start(0);
    } catch (e) {
      console.warn("Failed playing background music track safely:", e);
    }
  }

  // Start recorder
  recorder.start();

  // 6. Draw Animation Timeline Loop in real-time
  const fps = canvasFPS;
  const frameInterval = 1000 / fps;
  let currentSec = 0;
  let activeSlideIdx = 0;
  let slideElapsedSec = 0;

  onProgress({ status: "A renderizar e gravar Filme das Memórias em tempo real...", percent: 75 });

  const renderFrame = () => {
    if (activeSlideIdx >= slides.length) {
      return false;
    }

    const slide = slides[activeSlideIdx];
    const duration = slide.duration;

    // Background Canvas Clear
    ctx.fillStyle = "#FAF9F5"; // Soft wedding cream
    ctx.fillRect(0, 0, width, height);

    // Decorative thin gold inner margin frame
    ctx.strokeStyle = "#BF9B30";
    ctx.lineWidth = isMobile ? 2 : 4;
    ctx.strokeRect(isMobile ? 10 : 20, isMobile ? 10 : 20, width - (isMobile ? 20 : 40), height - (isMobile ? 20 : 40));

    // Transition effect parameters
    const transitionDuration = 0.8; // seconds
    let alpha = 1.0;
    if (slideElapsedSec < transitionDuration) {
      alpha = slideElapsedSec / transitionDuration; // Fade in
    } else if (duration - slideElapsedSec < transitionDuration) {
      alpha = (duration - slideElapsedSec) / transitionDuration; // Fade out
    }
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

    // A. Render Slide Content
    if (slide.type === "title") {
      ctx.textAlign = "center";
      
      // Title
      ctx.fillStyle = "#2F453A"; 
      ctx.font = isMobile ? "italic 32px 'Times New Roman', serif" : "italic 64px 'Times New Roman', serif";
      ctx.fillText("Rúben & Catarina", width / 2, height / 2 - (isMobile ? 20 : 40));

      // Subtitle
      ctx.fillStyle = "#BF9B30"; 
      ctx.font = isMobile ? "bold 11px Arial" : "bold tracking-wide 20px 'Helvetica Neue', Arial, sans-serif";
      ctx.fillText("O FILME DAS NOSSAS MEMÓRIAS", width / 2, height / 2 + (isMobile ? 15 : 30));

      // Footer
      ctx.fillStyle = "#788A81";
      ctx.font = isMobile ? "italic 9px 'Times New Roman', serif" : "italic 16px 'Times New Roman', serif";
      ctx.fillText("Compilação Exclusiva de Boda • 14 Junho 2026", width / 2, height / 2 + (isMobile ? 40 : 80));

    } else if (slide.type === "photo" && slide.img) {
      const progressRatio = slideElapsedSec / duration;
      const zoomScale = 1.0 + progressRatio * 0.08; // 8% Ken Burns zoom in

      const targetW = width - (isMobile ? 100 : 200);
      const targetH = height - (isMobile ? 90 : 160);
      const leftX = (width - targetW) / 2;
      const topY = isMobile ? 30 : 50;

      ctx.save();
      // Clip image to centered container
      ctx.beginPath();
      ctx.rect(leftX, topY, targetW, targetH);
      ctx.clip();

      const origW = slide.img.width;
      const origH = slide.img.height;
      const hRatio = targetW / origW;
      const vRatio = targetH / origH;
      const ratio = Math.max(hRatio, vRatio);

      const renderW = origW * ratio * zoomScale;
      const renderH = origH * ratio * zoomScale;
      const renderX = (width - renderW) / 2;
      const renderY = (height - renderH) / 2 - (isMobile ? 10 : 20);

      ctx.drawImage(slide.img, renderX, renderY, renderW, renderH);
      ctx.restore();

      // Golden border around the clipped photo frame
      ctx.strokeStyle = "#4A5D4E";
      ctx.lineWidth = isMobile ? 1.5 : 3;
      ctx.strokeRect(leftX, topY, targetW, targetH);

      // Photo label and details block overlay
      ctx.fillStyle = "rgba(47, 69, 58, 0.85)";
      const barH = isMobile ? 45 : 80;
      ctx.fillRect(leftX, topY + targetH - barH, targetW, barH);

      // Label text
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "left";
      ctx.font = isMobile ? "bold 10px Arial, sans-serif" : "bold 18px Arial, sans-serif";
      ctx.fillText(`Partilhada por: ${slide.author || "Convidado"}`, leftX + (isMobile ? 15 : 30), topY + targetH - (isMobile ? 26 : 48));

      ctx.direction = "ltr";
      ctx.fillStyle = "#BF9B30";
      ctx.font = isMobile ? "8px Arial, sans-serif" : "14px Arial, sans-serif";
      ctx.fillText(`❤ ${slide.likes || 0} gostos da plateia`, leftX + (isMobile ? 15 : 30), topY + targetH - (isMobile ? 10 : 20));

      if (slide.favorite) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#FFD700";
        ctx.font = isMobile ? "bold 9px Arial, sans-serif" : "bold 15px Arial, sans-serif";
        ctx.fillText("★ DESTACADA POR NOIVOS", leftX + targetW - (isMobile ? 15 : 30), topY + targetH - (isMobile ? 18 : 35));
      }

    } else if (slide.type === "message") {
      ctx.textAlign = "center";
      
      const cardX = isMobile ? 40 : 150;
      const cardY = isMobile ? 40 : 100;
      const cardW = width - (cardX * 2);
      const cardH = height - (cardY * 2);

      // Card Background Box
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, isMobile ? 12 : 24);
      ctx.fill();
      ctx.strokeStyle = "#4A5D4E";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Flower icon decoration
      ctx.fillStyle = "#BF9B30";
      ctx.font = isMobile ? "24px Arial, sans-serif" : "40px Arial, sans-serif";
      ctx.fillText("✍️", width / 2, cardY + (isMobile ? 35 : 75));

      // Dedication Title
      ctx.fillStyle = "#788A81";
      ctx.font = isMobile ? "bold 10px Arial, sans-serif" : "bold 14px Arial, sans-serif";
      ctx.fillText(`DEDICATÓRIA DE ${slide.author?.toUpperCase() || "CONVIDADO"}`, width / 2, cardY + (isMobile ? 65 : 130));

      // The main quotes text
      ctx.fillStyle = "#2F453A";
      ctx.font = isMobile ? "italic 13px 'Times New Roman', serif" : "italic 26px 'Times New Roman', serif";
      const cleanedText = slide.text ? `"${slide.text}"` : '"Votos felizes ao casal!"';
      const textY = cardY + (isMobile ? 95 : 190);
      const textMaxWidth = cardW - (isMobile ? 30 : 120);
      const textLineHeight = isMobile ? 18 : 36;
      drawWrappedText(ctx, cleanedText, width / 2, textY, textMaxWidth, textLineHeight);

    } else if (slide.type === "end") {
      ctx.textAlign = "center";

      ctx.fillStyle = "#2F453A";
      ctx.font = isMobile ? "italic 24px 'Times New Roman', serif" : "italic 48px 'Times New Roman', serif";
      ctx.fillText("E assim começa", width / 2, height / 2 - (isMobile ? 25 : 50));
      ctx.fillText("a nossa maior aventura...", width / 2, height / 2 + (isMobile ? 5 : 10));

      ctx.fillStyle = "#BF9B30";
      ctx.font = isMobile ? "bold 8px Arial, sans-serif" : "bold 13px Arial, sans-serif";
      ctx.fillText("M O M E N T I A   💍   2 0 2 6", width / 2, height / 2 + (isMobile ? 40 : 80));
    }

    ctx.restore(); // slide restore

    // B. Draw overall progress HUD layer on Canvas bottom
    ctx.save();
    ctx.fillStyle = "rgba(47, 69, 58, 0.7)";
    ctx.fillRect(0, height - 10, width, 10);
    ctx.fillStyle = "#BF9B30";
    ctx.fillRect(0, height - 10, (currentSec / totalDuration) * width, 10);
    ctx.restore();

    return true;
  };

  // 7. Core timeline player ticks
  let currentElapsedMs = 0;
  const loopInterval = frameInterval;
  let triggeredVoicesCount = 0;

  const audioTriggerChecker = (elapsedSec: number) => {
    if (hasAudio && triggeredVoicesCount < decodedVoices.length) {
      const schedTime = voiceStartTimeList[triggeredVoicesCount];
      if (elapsedSec >= schedTime) {
        try {
          const voiceInfo = decodedVoices[triggeredVoicesCount];
          const voiceSource = audioCtx.createBufferSource();
          voiceSource.buffer = voiceInfo.buffer;

          const duckDuration = voiceInfo.buffer.duration;
          const rampTime = audioCtx.currentTime;

          // Duck background music volume
          bgGain.gain.setValueAtTime(0.2, rampTime);
          bgGain.gain.exponentialRampToValueAtTime(0.04, rampTime + 0.5);
          
          // Restore background music volume afterwards
          bgGain.gain.setValueAtTime(0.04, rampTime + duckDuration);
          bgGain.gain.exponentialRampToValueAtTime(0.2, rampTime + duckDuration + 0.8);

          voiceSource.connect(dest);
          voiceSource.start(0);
        } catch (e) {
          console.warn("Failed safe playing guest voice track inside movie generator:", e);
        }
        triggeredVoicesCount++;
      }
    }
  };

  return new Promise<string>((resolve, reject) => {
    const playAndRecordTick = () => {
      let keepGoing = false;
      try {
        keepGoing = renderFrame();
      } catch (renderError) {
        console.error("Frame rendering issue caught safely:", renderError);
        keepGoing = true; // Keep compiling frames so a minor drawing glitch doesn't abort the entire video
      }

      if (!keepGoing) {
        // Stop recording and close sound contexts
        try {
          recorder.stop();
        } catch (e) {
          console.warn("Failed web recording wrap-up execution safely:", e);
        }
        audioCtx.close().catch(() => {});
        onProgress({ status: "A compilar faixa de vídeo final...", percent: 90 });

        recordingPromise
          .then(async (videoBlob) => {
            onProgress({ status: "A enviar filme real para o servidor Firebase...", percent: 95 });
            
            let ext = "webm";
            let contentType = videoBlob.type || "video/webm";
            if (videoBlob.type.includes("mp4")) {
              ext = "mp4";
              contentType = "video/mp4";
            } else if (videoBlob.type.includes("quicktime") || videoBlob.type.includes("mov")) {
              ext = "mov";
              contentType = "video/quicktime";
            }
            
            // Upload to Firebase Storage
            const randomId = Date.now();
            const videoRef = ref(storage, `movies/filme_memorias_${randomId}.${ext}`);
            const metadata = { contentType };
            
            await uploadBytes(videoRef, videoBlob, metadata);
            const downloadUrl = await getDownloadURL(videoRef);
            
            resolve(downloadUrl);
          })
          .catch((err) => {
            reject(err);
          });
        return;
      }

      currentElapsedMs += loopInterval;
      currentSec = currentElapsedMs / 1000;
      slideElapsedSec += loopInterval / 1000;

      const currentSlide = slides[activeSlideIdx];
      if (slideElapsedSec >= currentSlide.duration) {
        activeSlideIdx++;
        slideElapsedSec = 0;
      }

      audioTriggerChecker(currentSec);

      const percent = Math.floor(75 + (currentSec / totalDuration) * 13);
      onProgress({
        status: `A processar fotograma: ${currentSec.toFixed(1)}s / ${totalDuration.toFixed(1)}s`,
        percent: Math.min(88, percent),
      });

      setTimeout(playAndRecordTick, frameInterval);
    };

    playAndRecordTick();
  });
};
