/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, Camera, MessageSquare, Music, Download, Play, Pause, 
  ChevronRight, ChevronLeft, Heart, Calendar, Star, Volume2, VolumeX, 
  Loader2, ArrowRight, FileText, Share2, Clipboard, Mic, Film
} from "lucide-react";
import { doc, getDoc, setDoc, onSnapshot, collection, getDocs } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Photo, Message } from "../types";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { generateMemoriesMovie, MovieAsset, GenerationProgress } from "../utils/movieGenerator";
import InteractiveMoviePlayer from "./InteractiveMoviePlayer";
import jasminsImage from "../assets/images/quinta_jasmins_watercolor_1780327490515.png";


// Helper to synthesize soft harmonic harp/wind chime tones completely offline using Web Audio API
class ZenSynth {
  private ctx: AudioContext | null = null;
  private intervalId: any = null;
  private isPlaying = false;

  start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    } catch {
      return;
    }

    const pentatonic = [196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];

    const playTone = () => {
      if (!this.ctx || this.ctx.state === "suspended") return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const delay = this.ctx.createDelay();
      const feedback = this.ctx.createGain();

      const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      
      // Soft, warm sine-wave or triangle
      osc.type = Math.random() > 0.5 ? "sine" : "triangle";

      // Gain node for ADSR
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 4.5);

      // Delay feedback loop to act as reverberation
      delay.delayTime.value = 0.5;
      feedback.gain.value = 0.4;

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      // delay effects path
      gain.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + 5.0);
    };

    // Random play interval (approx 1.5 to 3 seconds spacing)
    const scheduleNext = () => {
      if (!this.isPlaying) return;
      playTone();
      const nextDelay = 1200 + Math.random() * 2000;
      this.intervalId = setTimeout(scheduleNext, nextDelay);
    };

    scheduleNext();
  }

  stop() {
    this.isPlaying = false;
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

interface StoredMemory {
  eventName: string;
  eventDate: string;
  generatedAt: number;
  musicType: "none" | "synth" | "piano" | "guitar" | "custom";
  customMusicName?: string;
  customMusicBase64?: string;
  photos: {
    id: string;
    imageUrl: string;
    author: string;
    likesCount: number;
    category: string;
    favorite: boolean;
    createdAtMs: number;
  }[];
  writtenMessages: {
    id: string;
    author: string;
    text: string;
    createdAtMs: number;
  }[];
  voiceMessages: {
    id: string;
    author: string;
    audioUrl: string;
    duration?: number;
    createdAtMs: number;
  }[];
  movieUrl?: string;
  movieGeneratedAt?: number;
}

interface MemoryViewProps {
  mode: "admin" | "guest";
  onNavigateHome?: () => void;
}

export default function MemoryView({ mode, onNavigateHome }: MemoryViewProps) {
  // Live aggregated DB metrics for admin info
  const [dbPhotosCount, setDbPhotosCount] = useState(0);
  const [dbMessagesCount, setDbMessagesCount] = useState(0);
  const [dbVoicesCount, setDbVoicesCount] = useState(0);
  const [dbLikesCount, setDbLikesCount] = useState(0);

  // Stored memory state from Firestore
  const [memory, setMemory] = useState<StoredMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingFinal, setGeneratingFinal] = useState(false);

  // Movie generation state managers
  const [movieGenerating, setMovieGenerating] = useState(false);
  const [isInteractivePlayerOpen, setIsInteractivePlayerOpen] = useState(false);
  const [movieProgress, setMovieProgress] = useState<GenerationProgress>({ status: "", percent: 0 });
  const movieCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Configuration options for Generation (Admin focus)
  const [musicType, setMusicType] = useState<"none" | "synth" | "piano" | "guitar" | "custom">("synth");
  const [customAudioPayload, setCustomAudioPayload] = useState<{ name: string; base64: string } | null>(null);
  const [audioUploadLoading, setAudioUploadLoading] = useState(false);

  // Guest experience states
  const [journeyStarted, setJourneyStarted] = useState(false);
  const [activeSegment, setActiveSegment] = useState<"photos" | "texts" | "voices" | "movie">("photos");
  const [audioMuted, setAudioMuted] = useState(false);
  
  // Slide controls
  const [slideIndex, setSlideIndex] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);

  // Media references
  const synthRef = useRef<ZenSynth | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const guestVoiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const [voicePlayingId, setVoicePlayingId] = useState<string | null>(null);
  const slideshowTimerRef = useRef<any>(null);

  // Status variables
  const [copiedLink, setCopiedLink] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);

  // URL link of memory
  const memoryShareUrl = `${window.location.origin}/memoria`;

  // Action to Generate Movie
  const handleGenerateMovieAction = async () => {
    if (!memory) return;
    setMovieGenerating(true);
    setMovieProgress({ status: "A preparar recursos do casamento...", percent: 0 });

    // Mark status on firestore so guests see live async progress immediately
    await setDoc(doc(db, "quiz_state", "memoria_viva"), {
      movieStatus: "generating",
      movieProgressPercent: 0,
      movieStatusText: "A inicializar motor de filme em nuvem..."
    }, { merge: true }).catch(console.error);

    let lastWriteMs = 0;

    try {
      // Setup the rendering options passed to standard encoder
      const movieAssets: MovieAsset = {
        photos: memory.photos,
        writtenMessages: memory.writtenMessages,
        voiceMessages: memory.voiceMessages,
        musicType: memory.musicType,
        customMusicBase64: memory.customMusicBase64
      };

      if (!movieCanvasRef.current) {
        throw new Error("Canvas element context is unavailable. Please try again.");
      }

      const movieUrlInput = await generateMemoriesMovie(
        movieAssets,
        movieCanvasRef.current,
        async (progress) => {
          setMovieProgress(progress);
          const now = Date.now();
          if (now - lastWriteMs > 2500 || progress.percent === 100) {
            lastWriteMs = now;
            await setDoc(doc(db, "quiz_state", "memoria_viva"), {
              movieProgressPercent: progress.percent,
              movieStatusText: progress.status
            }, { merge: true }).catch(console.error);
          }
        }
      );

      // Save Movie URL under general memory
      const updatedMemory = {
        ...memory,
        movieUrl: movieUrlInput,
        movieGeneratedAt: Date.now(),
        movieStatus: "completed",
        movieProgressPercent: 100,
        movieStatusText: "Concluído"
      };

      await setDoc(doc(db, "quiz_state", "memoria_viva"), updatedMemory);
      alert("🎬 Filme das Memórias gerado com sucesso eterno!");
    } catch (err: any) {
      console.error(err);
      await setDoc(doc(db, "quiz_state", "memoria_viva"), {
        movieStatus: "failed",
        movieStatusText: "Erro ao fabricar filme: " + err.message
      }, { merge: true }).catch(console.error);
      alert("Erro ao fabricar filme: " + err.message);
    } finally {
      setMovieGenerating(false);
    }
  };

  // 1. Listen for current memory state mapping
  useEffect(() => {
    let unsubViva: (() => void) | null = null;
    
    const unsubFinal = onSnapshot(doc(db, "quiz_state", "memoriaFinal"), (finalSnap) => {
      if (finalSnap.exists()) {
        const data = finalSnap.data() as StoredMemory;
        // Mark it as final/frozen
        setMemory(data);
        setLoading(false);
        if (unsubViva) {
          unsubViva();
          unsubViva = null;
        }
      } else {
        if (!unsubViva) {
          unsubViva = onSnapshot(doc(db, "quiz_state", "memoria_viva"), (vivaSnap) => {
            if (vivaSnap.exists()) {
              setMemory(vivaSnap.data() as StoredMemory);
            } else {
              setMemory(null);
            }
            setLoading(false);
          });
        }
      }
    });

    const unsubAll = () => {
      unsubFinal();
      if (unsubViva) {
        unsubViva();
      }
    };

    // If Admin mode, gather overall stats from DB for context
    if (mode === "admin") {
      getDocs(collection(db, "photos")).then((snap) => {
        setDbPhotosCount(snap.size);
        let likes = 0;
        snap.forEach(d => {
          likes += (d.data().likesCount || 0);
        });
        setDbLikesCount(likes);
      }).catch(console.error);

      getDocs(collection(db, "messages")).then((snap) => {
        let texts = 0;
        let voices = 0;
        snap.forEach(d => {
          if (d.data().hasAudio) {
            voices++;
          } else {
            texts++;
          }
        });
        setDbMessagesCount(texts);
        setDbVoicesCount(voices);
      }).catch(console.error);
    }

    return () => {
      unsubAll();
      if (synthRef.current) synthRef.current.stop();
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
        bgAudioRef.current = null;
      }
      if (guestVoiceAudioRef.current) {
        guestVoiceAudioRef.current.pause();
        guestVoiceAudioRef.current = null;
      }
      if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
    };
  }, [mode]);

  // Handle Automatic sliding sequence
  useEffect(() => {
    if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
    
    if (journeyStarted && activeSegment === "photos" && isAutoPlay && memory && memory.photos.length > 0) {
      slideshowTimerRef.current = setInterval(() => {
        setSlideIndex((prev) => (prev + 1) % memory.photos.length);
      }, 4000); // 4 seconds interval per image
    }

    return () => {
      if (slideshowTimerRef.current) clearInterval(slideshowTimerRef.current);
    };
  }, [journeyStarted, activeSegment, isAutoPlay, memory]);

  // Audio trigger control
  useEffect(() => {
    if (!journeyStarted || isInteractivePlayerOpen) {
      if (synthRef.current) synthRef.current.stop();
      if (bgAudioRef.current) {
        bgAudioRef.current.pause();
        bgAudioRef.current = null;
      }
      return;
    }

    // Stop current audios first
    if (synthRef.current) synthRef.current.stop();
    if (bgAudioRef.current) {
      bgAudioRef.current.pause();
      bgAudioRef.current = null;
    }

    if (audioMuted) return;

    if (memory) {
      const audio = new Audio("https://ceenaija.com/wp-content/uploads/2021/04/Calum_Scott_-_You_Are_The_Reason_CeeNaija.com_.mp3");
      audio.loop = true;
      audio.volume = 0.35;
      audio.play().catch((err) => {
        console.warn("Failed back play, trying piano loop...", err);
        audio.src = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
        audio.play().catch(console.warn);
      });
      bgAudioRef.current = audio;
    }
  }, [journeyStarted, audioMuted, memory, isInteractivePlayerOpen]);

  // Audio file browser helper
  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioUploadLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setCustomAudioPayload({
          name: file.name,
          base64: base64
        });
      }
      setAudioUploadLoading(false);
    };
    reader.onerror = () => {
      alert("Falha ao processar ficheiro de áudio.");
      setAudioUploadLoading(false);
    };
    reader.readAsDataURL(file);
  };

  // 2. TRIGGER GENERATION PROCESS (Compiles the complete single memory snapshot once)
  const handleGenerateMemory = async () => {
    setGenerating(true);
    try {
      // Fetch latest photos snapshot
      const photoSnap = await getDocs(collection(db, "photos"));
      const finalPhotos: any[] = [];
      photoSnap.forEach((d) => {
        const p = d.data();
        finalPhotos.push({
          id: d.id,
          imageUrl: p.imageUrl,
          author: p.author || "Convidado",
          likesCount: p.likesCount || 0,
          category: p.category || "Momentos",
          favorite: !!p.favorite,
          createdAtMs: p.createdAt?.seconds ? p.createdAt.seconds * 1000 : Date.now()
        });
      });

      // Filter and Sort: Favorites first, then sorting by likesCount page desc, then createdAt desc
      finalPhotos.sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
        return b.createdAtMs - a.createdAtMs;
      });

      // Fetch message records
      const messageSnap = await getDocs(collection(db, "messages"));
      const written: any[] = [];
      const voices: any[] = [];

      messageSnap.forEach((d) => {
        const m = d.data();
        const createdAtMs = m.createdAt?.seconds ? m.createdAt.seconds * 1000 : Date.now();
        if (m.hasAudio && m.audioUrl) {
          voices.push({
            id: d.id,
            author: m.author || "Anónimo",
            audioUrl: m.audioUrl,
            duration: m.duration || 0,
            createdAtMs
          });
        } else {
          written.push({
            id: d.id,
            author: m.author || "Anónimo",
            text: m.text || "",
            createdAtMs
          });
        }
      });

      written.sort((a, b) => b.createdAtMs - a.createdAtMs);
      voices.sort((a, b) => b.createdAtMs - a.createdAtMs);

      const computedMemory: StoredMemory = {
        eventName: "Rúben & Catarina",
        eventDate: "14 de Junho de 2026",
        generatedAt: Date.now(),
        musicType: musicType,
        photos: finalPhotos,
        writtenMessages: written,
        voiceMessages: voices
      };

      if (musicType === "custom" && customAudioPayload) {
        computedMemory.customMusicName = customAudioPayload.name;
        computedMemory.customMusicBase64 = customAudioPayload.base64;
      }

      await setDoc(doc(db, "quiz_state", "memoria_viva"), computedMemory);
      alert("✨ Memória Viva do Casamento gerada com total sucesso! Disponível a partir deste momento para todos os convidados.");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao compilar memóriaiva do evento: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // 2B. TRIGGER FINAL FREEZING PROCESS (Saves snapshot permanently as memoriaFinal)
  const handleCreateFinalMemory = async () => {
    setGeneratingFinal(true);
    try {
      // Fetch latest photos snapshot
      const photoSnap = await getDocs(collection(db, "photos"));
      const finalPhotos: any[] = [];
      photoSnap.forEach((d) => {
        const p = d.data();
        finalPhotos.push({
          id: d.id,
          imageUrl: p.imageUrl,
          author: p.author || "Convidado",
          likesCount: p.likesCount || 0,
          category: p.category || "Momentos",
          favorite: !!p.favorite,
          createdAtMs: p.createdAt?.seconds ? p.createdAt.seconds * 1000 : Date.now()
        });
      });

      // Filter and Sort: Favorites first, then sorting by likesCount desc, then createdAt desc
      finalPhotos.sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        if (b.likesCount !== a.likesCount) return b.likesCount - a.likesCount;
        return b.createdAtMs - a.createdAtMs;
      });

      // Fetch message records
      const messageSnap = await getDocs(collection(db, "messages"));
      const written: any[] = [];
      const voices: any[] = [];

      messageSnap.forEach((d) => {
        const m = d.data();
        const createdAtMs = m.createdAt?.seconds ? m.createdAt.seconds * 1000 : Date.now();
        if (m.hasAudio && m.audioUrl) {
          voices.push({
            id: d.id,
            author: m.author || "Anónimo",
            audioUrl: m.audioUrl,
            duration: m.duration || 0,
            createdAtMs
          });
        } else {
          written.push({
            id: d.id,
            author: m.author || "Anónimo",
            text: m.text || "",
            createdAtMs
          });
        }
      });

      written.sort((a, b) => b.createdAtMs - a.createdAtMs);
      voices.sort((a, b) => b.createdAtMs - a.createdAtMs);

      const computedMemory: StoredMemory = {
        eventName: "Rúben & Catarina",
        eventDate: "14 de Junho de 2026",
        generatedAt: Date.now(),
        musicType: musicType,
        photos: finalPhotos,
        writtenMessages: written,
        voiceMessages: voices
      };

      if (musicType === "custom" && customAudioPayload) {
        computedMemory.customMusicName = customAudioPayload.name;
        computedMemory.customMusicBase64 = customAudioPayload.base64;
      }

      await setDoc(doc(db, "quiz_state", "memoriaFinal"), {
        ...computedMemory,
        isFrozenFinal: true,
        frozenAt: Date.now()
      });
      alert("✨ Criar Memória Final Concluído! A Memória foi compilada e congelada na base de dados com absoluto sucesso. Quaisquer envios futuros de convidados não afetarão esta versão.");
    } catch (err: any) {
      console.error(err);
      alert("Erro ao fabricar e congelar Memória Final: " + err.message);
    } finally {
      setGeneratingFinal(false);
    }
  };

  // Copy Link to clipboard
  const handleCopyShareLink = () => {
    navigator.clipboard.writeText(memoryShareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // 3. DOWNLOAD SYSTEM: PDF Generation using jsPDF
  const downloadPDFMemory = async () => {
    if (!memory) return;
    setDownloadProgress("A inicializar gerador PDF...");
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const primaryColor = "#2F453A";
      const goldAccent = "#BF9B30";
      const fontSerif = "times";

      // PAGE 1: COVER
      setDownloadProgress("A desenhar capa do PDF...");
      // Margins and decorative frame
      doc.setDrawColor(191, 155, 48); // Gold
      doc.setLineWidth(0.6);
      doc.rect(8, 8, 194, 281);
      doc.rect(9.5, 9.5, 191, 278);

      // Heart graphic
      doc.setDrawColor(47, 69, 58);
      doc.setFillColor(254, 252, 246);
      
      doc.setFont(fontSerif, "normal");
      doc.setTextColor(primaryColor);
      doc.setFontSize(28);
      doc.text("MOMENTIA", 105, 75, { align: "center" });

      doc.setFontSize(14);
      doc.setTextColor(goldAccent);
      doc.text("M E M Ó R I A   V I V A", 105, 87, { align: "center" });

      doc.setLineWidth(0.3);
      doc.line(75, 95, 135, 95);

      doc.setFont(fontSerif, "italic");
      doc.setFontSize(36);
      doc.setTextColor(primaryColor);
      doc.text("Rúben & Catarina", 105, 125, { align: "center" });

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.setTextColor("#788A81");
      doc.text("O Álbum Final & Votos Coletivos dos Convidados", 105, 138, { align: "center" });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(primaryColor);
      doc.text("14 de Junho de 2026", 105, 200, { align: "center" });

      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor("#999999");
      doc.text("Documento digital autêntico gerado em " + new Date(memory.generatedAt).toLocaleDateString("pt-PT"), 105, 260, { align: "center" });

      // PAGE 2: TIMELINE AND STATS
      setDownloadProgress("A preparar cronologia e estatísticas...");
      doc.addPage();
      doc.rect(8, 8, 194, 281);

      doc.setFont(fontSerif, "bold");
      doc.setFontSize(20);
      doc.setTextColor(primaryColor);
      doc.text("Resumo de Vivências Coletivas", 20, 25);
      doc.line(20, 29, 190, 29);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor("#4A5D4E");
      doc.text("Este livro reúne cada olhar, cada emoção e palavra registados ao longo do dia mais especial das nossas vidas. Uma coleção eterna gerada uma única vez para podermos recordar juntos ao longo das décadas.", 20, 38, { maxWidth: 170 });

      // Stat boxes
      doc.setFillColor(248, 249, 246);
      doc.rect(20, 60, 42, 30, "F");
      doc.rect(73, 60, 42, 30, "F");
      doc.rect(126, 60, 42, 30, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(goldAccent);
      doc.text(String(memory.photos.length), 41, 74, { align: "center" });
      doc.text(String(memory.writtenMessages.length), 94, 74, { align: "center" });
      doc.text(String(memory.voiceMessages.length), 147, 74, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor("#788A81");
      doc.text("Fotografias Partilhadas", 41, 82, { align: "center" });
      doc.text("Dedication Cards", 94, 82, { align: "center" });
      doc.text("Mensagens de Voz", 147, 82, { align: "center" });

      // Timeline entries
      doc.setFont(fontSerif, "bold");
      doc.setFontSize(16);
      doc.setTextColor(primaryColor);
      doc.text("Marcos Importantes do Dia", 20, 115);
      doc.line(20, 119, 100, 119);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(goldAccent);
      doc.text("12:30", 20, 135);
      doc.text("14:00", 20, 155);
      doc.text("18:00", 20, 175);
      doc.text("23:59", 20, 195);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(primaryColor);
      doc.text("Cerimónia Solene de Enlace na Igreja de Pedroso", 38, 135);
      doc.text("Receção dos Convidados e Brinde na Quinta dos Jasmins", 38, 155);
      doc.text("Abertura Oficial da pista com corte simbólico do bolo", 38, 175);
      doc.text("Balanço final do Livro Digital de Recordações", 38, 195);

      // PAGE 3: PHOTOS GRID
      setDownloadProgress("A incorporar fotografias mais votadas...");
      doc.addPage();
      doc.rect(8, 8, 194, 281);
      
      doc.setFont(fontSerif, "bold");
      doc.setFontSize(20);
      doc.setTextColor(primaryColor);
      doc.text("Capítulo I: Os Melhores Olhares", 20, 25);
      doc.line(20, 29, 190, 29);

      // Look at top 3 photos with base64 embedded
      const limitPhotos = memory.photos.slice(0, 4);
      let photoY = 40;

      for (let i = 0; i < limitPhotos.length; i++) {
        const photo = limitPhotos[i];
        setDownloadProgress(`A renderizar de perto a foto ${i+1}/${limitPhotos.length}`);
        
        // Draw image frame
        doc.setFillColor(250, 250, 248);
        doc.rect(20, photoY, 170, 52, "F");

        try {
          doc.addImage(photo.imageUrl, "JPEG", 24, photoY + 4, 44, 44, undefined, "FAST");
        } catch (e) {
          // Draw fallback box if image string is invalid
          doc.setDrawColor(200, 200, 200);
          doc.rect(24, photoY + 4, 44, 44);
          doc.setFontSize(8);
          doc.text("Foto Base64", 46, photoY + 26, { align: "center" });
        }

        // Photo info text
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryColor);
        doc.text("Capturada por: " + photo.author, 78, photoY + 12);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor("#788A81");
        doc.text("Categoria: " + photo.category.toUpperCase(), 78, photoY + 20);
        doc.text(`Likes obtidos na plateia: ${photo.likesCount} gostos`, 78, photoY + 28);
        
        if (photo.favorite) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(goldAccent);
          doc.text("★ Destacada pelos Noivos", 78, photoY + 36);
        }

        photoY += 58;
      }

      // PAGE 4: WRITTEN VOWS/MESSAGES
      setDownloadProgress("A organizar votos escritos...");
      doc.addPage();
      doc.rect(8, 8, 194, 281);

      doc.setFont(fontSerif, "bold");
      doc.setFontSize(20);
      doc.setTextColor(primaryColor);
      doc.text("Capítulo II: Livro dos Afetos Escritos", 20, 25);
      doc.line(20, 29, 190, 29);

      let textY = 40;
      const subsetMsgs = memory.writtenMessages.slice(0, 9);

      subsetMsgs.forEach((msg, idx) => {
        doc.setFillColor(252, 252, 250);
        doc.setDrawColor(230, 232, 227);
        doc.rect(20, textY, 170, 22, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(primaryColor);
        doc.text("De: " + msg.author, 24, textY + 7);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(9.5);
        doc.setTextColor("#4A5D4E");
        const formattedTxt = msg.text.substring(0, 100) + (msg.text.length > 100 ? "..." : "");
        doc.text(`"${formattedTxt}"`, 24, textY + 14, { maxWidth: 160 });

        textY += 25;
      });

      // PAGE 5: AUDIO QR MATRIX
      setDownloadProgress("A preparar códigos de escuta áudio...");
      doc.addPage();
      doc.rect(8, 8, 194, 281);

      doc.setFont(fontSerif, "bold");
      doc.setFontSize(20);
      doc.setTextColor(primaryColor);
      doc.text("Capítulo III: Vozes e Mensagens Vivificadas", 20, 25);
      doc.line(20, 29, 190, 29);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor("#556B2F");
      doc.text("Abaixo encontram-se listadas as mensagens de voz deixadas no portal interativo pelos convidados. Use o leitor de câmara do seu smartphone para aceder e ouvir em direto o áudio gravado!", 20, 36, { maxWidth: 170 });

      let audioY = 52;
      const subsetVoices = memory.voiceMessages.slice(0, 4);

      subsetVoices.forEach((vMsg, idx) => {
        doc.setFillColor(248, 249, 246);
        doc.rect(20, audioY, 170, 48, "F");

        // Microphone marker
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(primaryColor);
        doc.text(`🎤 Gravado por: ${vMsg.author}`, 26, audioY + 15);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor("#788A81");
        doc.text(`Duração da escuta: ${vMsg.duration ? vMsg.duration.toFixed(1) : "3.0"} segundos`, 26, audioY + 23);
        doc.text("Digitalize o QR Code ao lado", 26, audioY + 31);
        doc.text("para escutar a voz em direto no portal.", 26, audioY + 37);

        // Simulated QR positioning box
        doc.setDrawColor(190, 190, 190);
        doc.setFillColor(255, 255, 255);
        doc.rect(138, audioY + 4, 40, 40, "FD");

        doc.setFontSize(7.5);
        doc.setTextColor("#999999");
        doc.text("A L T O F A L A N T E", 158, audioY + 20, { align: "center" });
        doc.setFontSize(9);
        doc.text("🎚️ QR CODE", 158, audioY + 27, { align: "center" });

        audioY += 54;
      });

      setDownloadProgress("A finalizar documento PDF...");
      doc.save(`memoria_viva_ruben_catarina_${Date.now()}.pdf`);
      setDownloadProgress(null);
      alert("📥 Download do PDF Concluído com sucesso!");
    } catch (err: any) {
      console.error(err);
      setDownloadProgress(null);
      alert("Erro ao fabricar PDF: " + err.message);
    }
  };

  // 4. DOWNLOAD SYSTEM: ZIP bundle compile with JSZip
  const downloadZIPPhotos = async () => {
    if (!memory) return;
    setDownloadProgress("A preparar fotografias...");
    try {
      const zip = new JSZip();
      const folderPhotos = zip.folder("fotografias");
      memory.photos.forEach((photo, idx) => {
        const parts = photo.imageUrl.split(",");
        const base64Data = parts[1] || parts[0];
        const extension = photo.imageUrl.includes("png") ? "png" : "jpg";
        const filename = `${photo.author.replace(/[^a-zA-Z0-9]/g, "_")}_${idx + 1}.${extension}`;
        folderPhotos?.file(filename, base64Data, { base64: true });
      });

      setDownloadProgress("A compactar fotografias...");
      zip.generateAsync({ type: "blob" }).then((content) => {
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `fotos_casamento_ruben_catarina_${Date.now()}.zip`;
        a.click();
        setDownloadProgress(null);
        alert("📥 Download das Fotografias (ZIP) concluído com sucesso!");
      });
    } catch (err: any) {
      console.error(err);
      setDownloadProgress(null);
      alert("Erro ao empacotar fotos: " + err.message);
    }
  };

  const downloadZIPAudios = async () => {
    if (!memory) return;
    if (memory.voiceMessages.length === 0) {
      alert("Ainda não existem mensagens de voz gravadas para descarregar.");
      return;
    }
    setDownloadProgress("A preparar mensagens de voz...");
    try {
      const zip = new JSZip();
      const folderVoices = zip.folder("mensagens_de_voz");
      memory.voiceMessages.forEach((vMsg, idx) => {
        const parts = vMsg.audioUrl.split(",");
        const base64Data = parts[1] || parts[0];
        const filename = `voz_${vMsg.author.replace(/[^a-zA-Z0-9]/g, "_")}_${idx + 1}.webm`;
        folderVoices?.file(filename, base64Data, { base64: true });
      });

      setDownloadProgress("A compactar mensagens de voz...");
      zip.generateAsync({ type: "blob" }).then((content) => {
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `audios_casamento_ruben_catarina_${Date.now()}.zip`;
        a.click();
        setDownloadProgress(null);
        alert("📥 Download das Mensagens de Voz (ZIP) concluído com sucesso!");
      });
    } catch (err: any) {
      console.error(err);
      setDownloadProgress(null);
      alert("Erro ao empacotar áudios: " + err.message);
    }
  };

  const downloadZIPCollection = async () => {
    if (!memory) return;
    setDownloadProgress("A fabricar ficheiro ZIP...");
    try {
      const zip = new JSZip();

      // Folder 1: Photos
      const folderPhotos = zip.folder("fotografias");
      memory.photos.forEach((photo, idx) => {
        // Clean metadata headers from Base64
        const parts = photo.imageUrl.split(",");
        const base64Data = parts[1] || parts[0];
        const extension = photo.imageUrl.includes("png") ? "png" : "jpg";
        const filename = `${photo.author.replace(/[^a-zA-Z0-9]/g, "_")}_${idx + 1}.${extension}`;
        
        folderPhotos?.file(filename, base64Data, { base64: true });
      });

      // File 2: Messages log
      let textFileContent = `=== LIVRO DE RECORDAÇÕES ESCRITAS - RÚBEN & CATARINA ===\n`;
      textFileContent += `Data do Casamento: 14 de Junho de 2026\n`;
      textFileContent += `Mural gerado em: ${new Date(memory.generatedAt).toLocaleString("pt-PT")}\n`;
      textFileContent += `========================================================\n\n`;

      memory.writtenMessages.forEach((msg, idx) => {
        textFileContent += `Voto #${idx + 1} por [${msg.author}]:\n`;
        textFileContent += `"${msg.text}"\n`;
        textFileContent += `--------------------------------------------------------\n\n`;
      });
      zip.file("votos_vivas_texto.txt", textFileContent);

      // Folder 3: Voice audios
      const folderVoices = zip.folder("mensagens_de_voz");
      memory.voiceMessages.forEach((vMsg, idx) => {
        const parts = vMsg.audioUrl.split(",");
        const base64Data = parts[1] || parts[0];
        const filename = `voz_${vMsg.author.replace(/[^a-zA-Z0-9]/g, "_")}_${idx + 1}.webm`;
        folderVoices?.file(filename, base64Data, { base64: true });
      });

      setDownloadProgress("A compactar coleções...");
      zip.generateAsync({ type: "blob" }).then((content) => {
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = `memoria_viva_ruben_catarina_completa_${Date.now()}.zip`;
        a.click();
        setDownloadProgress(null);
        alert("📥 Download do ficheiro ZIP concluído com sucesso!");
      });
    } catch (err: any) {
      console.error(err);
      setDownloadProgress(null);
      alert("Erro ao empacotar ZIP: " + err.message);
    }
  };

  const exportCompleteEventZIP = async () => {
    if (!memory) return;
    setDownloadProgress("A iniciar exportação do evento...");
    try {
      const zip = new JSZip();

      // Folder 1: /Fotos
      const folderPhotos = zip.folder("Fotos");
      if (memory.photos && memory.photos.length > 0) {
        setDownloadProgress("A preparar fotografias originais...");
        memory.photos.forEach((photo, idx) => {
          const parts = photo.imageUrl.split(",");
          const base64Data = parts[1] || parts[0];
          let extension = "jpg";
          if (photo.imageUrl.includes("image/png") || photo.imageUrl.includes("png")) {
            extension = "png";
          } else if (photo.imageUrl.includes("image/gif") || photo.imageUrl.includes("gif")) {
            extension = "gif";
          } else if (photo.imageUrl.includes("image/webp") || photo.imageUrl.includes("webp")) {
            extension = "webp";
          }
          const filename = `${photo.author.replace(/[^a-zA-Z0-9]/g, "_")}_${idx + 1}.${extension}`;
          folderPhotos?.file(filename, base64Data, { base64: true });
        });
      }

      // Folder 2: /Audios
      const folderAudios = zip.folder("Audios");
      if (memory.voiceMessages && memory.voiceMessages.length > 0) {
        setDownloadProgress("A preparar áudios originais...");
        memory.voiceMessages.forEach((vMsg, idx) => {
          const parts = vMsg.audioUrl.split(",");
          const base64Data = parts[1] || parts[0];
          let extension = "webm";
          if (vMsg.audioUrl.includes("audio/webm") || vMsg.audioUrl.includes("webm")) {
            extension = "webm";
          } else if (vMsg.audioUrl.includes("audio/mp3") || vMsg.audioUrl.includes("mp3")) {
            extension = "mp3";
          } else if (vMsg.audioUrl.includes("audio/wav") || vMsg.audioUrl.includes("wav")) {
            extension = "wav";
          } else if (vMsg.audioUrl.includes("audio/ogg") || vMsg.audioUrl.includes("ogg")) {
            extension = "ogg";
          } else if (vMsg.audioUrl.includes("audio/m4a") || vMsg.audioUrl.includes("m4a")) {
            extension = "m4a";
          }
          const filename = `audio_${vMsg.author.replace(/[^a-zA-Z0-9]/g, "_")}_${idx + 1}.${extension}`;
          folderAudios?.file(filename, base64Data, { base64: true });
        });
      }

      // Folder 3: /Mensagens
      setDownloadProgress("A criar livro de mensagens PDF...");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      const primaryColor = "#2F453A";
      const goldAccent = "#BF9B30";
      const fontSerif = "times";

      // Capa do Livro de Mensagens
      pdf.setDrawColor(191, 155, 48);
      pdf.setLineWidth(0.6);
      pdf.rect(8, 8, 194, 281);
      pdf.rect(9.5, 9.5, 191, 278);

      pdf.setFont(fontSerif, "normal");
      pdf.setTextColor(primaryColor);
      pdf.setFontSize(26);
      pdf.text("O LIVRO COMPLETO DAS MENSAGENS", 105, 80, { align: "center" });

      pdf.setFontSize(13);
      pdf.setTextColor(goldAccent);
      pdf.text("C O L E Ç Ã O   E T E R N A   D O S   C O N V I D A D O S", 105, 92, { align: "center" });

      pdf.setLineWidth(0.3);
      pdf.line(65, 100, 145, 100);

      pdf.setFont(fontSerif, "italic");
      pdf.setFontSize(36);
      pdf.setTextColor(primaryColor);
      pdf.text("Rúben & Catarina", 105, 135, { align: "center" });

      pdf.setFontSize(11.5);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor("#788A81");
      pdf.text("Todas as palavras, carinho e dedicatórias escritas", 105, 148, { align: "center" });

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.setTextColor(primaryColor);
      pdf.text("14 de Junho de 2026", 105, 210, { align: "center" });

      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(9.5);
      pdf.setTextColor("#999999");
      pdf.text(`Exportação administrativa gerada em ${new Date().toLocaleDateString("pt-PT")}`, 105, 260, { align: "center" });

      // Add messages pages dynamically
      let textY = 32;
      let pageNum = 1;
      const msgsPerPage = 7;

      if (memory.writtenMessages && memory.writtenMessages.length > 0) {
        memory.writtenMessages.forEach((msg, idx) => {
          if (idx % msgsPerPage === 0) {
            pdf.addPage();
            pageNum++;
            pdf.setDrawColor(191, 155, 48);
            pdf.setLineWidth(0.4);
            pdf.rect(8, 8, 194, 281);
            
            pdf.setFont(fontSerif, "bold");
            pdf.setFontSize(14);
            pdf.setTextColor(primaryColor);
            pdf.text(`Mensagens dos Convidados - Página ${pageNum - 1}`, 20, 22);
            pdf.setDrawColor(47, 69, 58, 0.2);
            pdf.line(20, 25, 190, 25);
            textY = 32;
          }

          pdf.setFillColor(252, 252, 250);
          pdf.setDrawColor(230, 232, 227);
          pdf.rect(20, textY, 170, 28, "F");

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10.5);
          pdf.setTextColor(primaryColor);
          pdf.text(`Votos de: ${msg.author || "Convidado"}`, 24, textY + 7);

          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(9.5);
          pdf.setTextColor("#4A5D4E");
          
          const splitText = pdf.splitTextToSize(msg.text || "", 160);
          pdf.text(splitText, 24, textY + 14);

          textY += 34;
        });
      } else {
        pdf.addPage();
        pdf.setDrawColor(191, 155, 48);
        pdf.setLineWidth(0.4);
        pdf.rect(8, 8, 194, 281);
        pdf.setFont("helvetica", "italic");
        pdf.setFontSize(12);
        pdf.setTextColor("#788A81");
        pdf.text("Nenhuma mensagem escrita registada até ao momento.", 105, 140, { align: "center" });
      }

      const pdfArrayBuffer = pdf.output("arraybuffer");
      zip.folder("Mensagens")?.file("Mensagens_Escritas_Completo.pdf", pdfArrayBuffer);

      // Folder 4: /Dados
      setDownloadProgress("A estruturar dados JSON...");
      const eventData = {
        evento: "Casamento Rúben & Catarina",
        data: "14 de Junho de 2026",
        exportadoEm: new Date().toISOString(),
        estatisticas: {
          totalFotos: memory.photos.length,
          totalMensagensEscritas: memory.writtenMessages.length,
          totalMensagensVoz: memory.voiceMessages.length
        },
        fotografias: memory.photos.map((p, index) => {
          let ext = "jpg";
          if (p.imageUrl.includes("image/png") || p.imageUrl.includes("png")) ext = "png";
          else if (p.imageUrl.includes("image/webp") || p.imageUrl.includes("webp")) ext = "webp";
          return {
            numero: index + 1,
            autor: p.author,
            gostos: p.likesCount,
            categoria: p.category,
            destacado: p.favorite,
            ficheiroOriginal: `${p.author.replace(/[^a-zA-Z0-9]/g, "_")}_${index + 1}.${ext}`
          };
        }),
        mensagensEscritas: memory.writtenMessages.map((m, index) => ({
          numero: index + 1,
          autor: m.author,
          mensagem: m.text
        })),
        mensagensVoz: memory.voiceMessages.map((v, index) => {
          let ext = "webm";
          if (v.audioUrl.includes("audio/mp3") || v.audioUrl.includes("mp3")) ext = "mp3";
          return {
            numero: index + 1,
            autor: v.author,
            duracaoSegundos: v.duration,
            ficheiroOriginal: `audio_${v.author.replace(/[^a-zA-Z0-9]/g, "_")}_${index + 1}.${ext}`
          };
        })
      };

      zip.folder("Dados")?.file("metadados.json", JSON.stringify(eventData, null, 2));

      // Final ZIP compile
      setDownloadProgress("A compactar ficheiro final Evento.zip...");
      zip.generateAsync({ type: "blob" }).then((content) => {
        const url = URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Evento.zip";
        a.click();
        setDownloadProgress(null);
        alert("✨ Exportação COMPLETA executada com sucesso! Ficheiro 'Evento.zip' descarregado. Contém todas as fotos e áudios com qualidade original intocável, PDF de mensagens estruturado e base de dados JSON integrada.");
      });

    } catch (err: any) {
      console.error(err);
      setDownloadProgress(null);
      alert("Erro ao realizar exportação completa do evento: " + err.message);
    }
  };

  // 5. DOWNLOAD SYSTEM: Standing Portable Offline HTML page
  const downloadCompleteStandaloneHTML = async () => {
    if (!memory) return;
    setDownloadProgress("A preparar Livro Digital Interativo...");
    try {
      // Build a beautiful self-contained offline single HTML document!
      // This document will render a stunning responsive design slider, custom pure HTML/JS slide controls,
      // base64 images embedded, guest cards, audio playback buttons and fully offline sound synth!
      let html = `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rúben & Catarina - Memória Viva do Casamento</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;1,400&family=Montserrat:wght@300;400;600&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Montserrat', sans-serif;
            background-color: #FAF9F5;
            color: #2F453A;
        }
        .text-serif {
            font-family: 'Playfair Display', serif;
        }
    </style>
</head>
<body class="min-h-screen flex flex-col antialiased">
    
    <!-- Top banner -->
    <header class="p-5 text-center bg-white border-b border-stone-200">
        <h1 class="text-serif text-3xl font-light tracking-wide">Rúben & Catarina</h1>
        <p class="text-xs uppercase tracking-widest text-[#788A81] mt-1.5">Livro de Memórias Digitais • 14 Junho 2026</p>
    </header>

    <main class="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-12">
        
        <!-- Opening Cover -->
        <section class="bg-white rounded-3xl p-8 border border-stone-150 text-center space-y-4 shadow-sm">
            <span class="text-amber-600 text-3xl">💍</span>
            <h2 class="text-serif text-4xl text-[#2F453A] font-light">Uma História em Partilha</h2>
            <p class="text-stone-500 text-sm max-w-lg mx-auto">
                Este livrete digital contém cada fotografia, cada voto e eco de voz capturado pelos nossos convidados. Guardado para a eternidade.
            </p>
            <div class="pt-4 flex justify-center gap-6 text-xs font-semibold text-[#556B2F]">
                <div>📸 ${memory.photos.length} Fotos</div>
                <div>✍️ ${memory.writtenMessages.length} Dedicatórias</div>
                <div>🎤 ${memory.voiceMessages.length} Áudios</div>
            </div>
        </section>

        <!-- Chapter 1: Photo Slideshow -->
        <section class="space-y-4">
            <h3 class="text-serif text-2xl font-bold border-b pb-2">📂 Capítulo I: Melhores Momentos</h3>
            <div class="bg-white rounded-3xl p-6 border border-stone-150 shadow-xs relative overflow-hidden">
                <div class="flex flex-col items-center">
                    <img id="main-slider" src="${memory.photos[0]?.imageUrl || ''}" class="max-h-[420px] object-contain rounded-2xl border" alt="Slide">
                    <div class="mt-4 text-center">
                        <p id="slider-author" class="text-xs font-bold">Enviada por: ${memory.photos[0]?.author || 'Convidado'}</p>
                        <p id="slider-likes" class="text-[11px] text-amber-600 mt-1">❤ Gostos da plateia: ${memory.photos[0]?.likesCount || 0}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center mt-6">
                    <button onclick="prevSlide()" class="py-2 px-4 bg-stone-100 hover:bg-stone-200 rounded-xl text-xs font-bold transition">◀ Anterior</button>
                    <span id="slider-counter" class="text-xs text-stone-400">1 / ${memory.photos.length}</span>
                    <button onclick="nextSlide()" class="py-2 px-4 bg-[#4A5D4E] text-white hover:bg-[#3E4F41] rounded-xl text-xs font-bold transition">Seguinte ▶</button>
                </div>
            </div>
        </section>

        <!-- Chapter 2: Written dedications -->
        <section class="space-y-4">
            <h3 class="text-serif text-2xl font-bold border-b pb-2">✍️ Capítulo II: Dedicatórias Escritas</h3>
            <div class="grid md:grid-cols-2 gap-4">
`;

      memory.writtenMessages.forEach((msg) => {
        html += `
                <div class="bg-white p-5 rounded-2xl border border-stone-150 shadow-2xs space-y-2">
                    <span class="text-[10px] font-bold text-stone-400">Escrito por: ${msg.author}</span>
                    <p class="text-sm italic leading-relaxed text-[#2F453A]">"${msg.text}"</p>
                </div>
        `;
      });

      html += `
            </div>
        </section>

        <!-- Chapter 3: Audio list -->
        <section class="space-y-4">
            <h3 class="text-serif text-2xl font-bold border-b pb-2">🎤 Capítulo III: Eco de Vozes</h3>
            <div class="grid md:grid-cols-2 gap-4">
`;

      memory.voiceMessages.forEach((voice, vIdx) => {
        html += `
                <div class="bg-white p-5 rounded-2xl border border-stone-150 flex items-center justify-between gap-4">
                    <div>
                        <span class="text-xs font-bold block">${voice.author}</span>
                        <span class="text-[10px] text-stone-400">${voice.duration ? voice.duration.toFixed(1) : "3.0"}s</span>
                    </div>
                    <button onclick="playVoiceAndPauseMusic('${voice.id}', '${voice.audioUrl}')" id="btn-${voice.id}" class="h-10 w-10 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-full flex items-center justify-center transition focus:outline-none">▶</button>
                </div>
        `;
      });

      html += `
            </div>
        </section>

    </main>

    <footer class="p-8 text-center bg-stone-100 text-xs text-stone-400 border-t border-stone-200 mt-12">
        <p>Criado com amor • Momentia & Memória Viva 💍</p>
    </footer>

    <!-- Interactive script definitions -->
    <script>
        const photos = ${JSON.stringify(memory.photos)};
        let activeIdx = 0;

        function updateSlider() {
            if(photos.length === 0) return;
            const photo = photos[activeIdx];
            document.getElementById("main-slider").src = photo.imageUrl;
            document.getElementById("slider-author").innerText = "Enviada por: " + photo.author;
            document.getElementById("slider-likes").innerText = "❤ Gostos da plateia: " + photo.likesCount;
            document.getElementById("slider-counter").innerText = (activeIdx + 1) + " / " + photos.length;
        }

        function nextSlide() {
            activeIdx = (activeIdx + 1) % photos.length;
            updateSlider();
        }

        function prevSlide() {
            activeIdx = (activeIdx - 1 + photos.length) % photos.length;
            updateSlider();
        }

        let voiceAudio = null;
        function playVoiceAndPauseMusic(id, base64) {
            if (voiceAudio) {
                voiceAudio.pause();
                const oldBtn = document.getElementById("btn-" + voiceAudio.targetId);
                if (oldBtn) oldBtn.innerText = "▶";
                if (voiceAudio.targetId === id) {
                    voiceAudio = null;
                    return;
                }
            }

            voiceAudio = new Audio(base64);
            voiceAudio.targetId = id;
            voiceAudio.onended = () => {
                document.getElementById("btn-" + id).innerText = "▶";
                voiceAudio = null;
            };
            document.getElementById("btn-" + id).innerText = "⏸";
            voiceAudio.play().catch(console.warn);
        }
    </script>
</body>
</html>`;

      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `livro_digital_memoria_ruben_catarina_${Date.now()}.html`;
      a.click();
      setDownloadProgress(null);
      alert("📥 Livro Digital Interativo descarregado com sucesso!");
    } catch (err: any) {
      console.error(err);
      setDownloadProgress(null);
      alert("Erro ao fabricar Livro Digital: " + err.message);
    }
  };

  // Helper voice track previewing handler inside player view
  const toggleVoiceListen = (vId: string, trackUrl: string) => {
    if (voicePlayingId === vId) {
      if (guestVoiceAudioRef.current) {
        guestVoiceAudioRef.current.pause();
      }
      setVoicePlayingId(null);
    } else {
      if (guestVoiceAudioRef.current) {
        guestVoiceAudioRef.current.pause();
      }
      const audio = new Audio(trackUrl);
      audio.onended = () => setVoicePlayingId(null);
      audio.play().catch(console.warn);
      guestVoiceAudioRef.current = audio;
      setVoicePlayingId(vId);
    }
  };

  // ==================== RENDERING COMPONENT LAYOUTS ====================

  // Loading Screen Indicator
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-[#788A81] gap-3 p-6" id="loading-container animate-fade-in">
        <Loader2 className="w-8 h-8 text-[#BF9B30] animate-spin" />
        <p className="text-xs font-semibold uppercase tracking-widest text-[#556B2F]">A sincronizar memórias...</p>
      </div>
    );
  }

  // A. RETRIEVING THE ADMINISTRATIVE WRAPPER CONTROL
  if (mode === "admin") {
    return (
      <div className="flex flex-col gap-5 p-4 font-sans text-[#2F453A]" id="admin-memories-panel">
        
        {/* Compilation settings card */}
        <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 shadow-xs flex flex-col gap-4 text-left">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📖</span>
            <div>
              <h3 className="text-sm font-bold text-[#2F453A] uppercase tracking-wide">Gerar Álbum de Memórias Final</h3>
              <p className="text-[10.5px] text-[#788A81]">Consolida fotos, likes, estrelas e votos dos convidados</p>
            </div>
          </div>

          {/* Database active snapshot info */}
          <div className="grid grid-cols-2 gap-2 bg-[#FAF9F5] border border-[#E6E8E3] rounded-2xl p-3.5 text-xs text-[#2F453A]">
            <div className="flex flex-col">
              <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider">Fotografias</span>
              <span className="text-lg font-bold">{dbPhotosCount} no total • {dbLikesCount} ❤</span>
            </div>
            <div className="flex flex-col">
              <span className="text-stone-400 text-[10px] uppercase font-bold tracking-wider">Votos Recebidos</span>
              <span className="text-lg font-bold">{dbMessagesCount} texto • {dbVoicesCount} 🎤</span>
            </div>
          </div>

          {/* Custom soundtrack preferences config */}
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold text-stone-500 uppercase tracking-wider flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-[#BF9B30]" />
              <span>Som de Fundo para Visitas</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              {[
                { type: "synth", label: "🌸 Zen Synth" },
                { type: "piano", label: "🎹 Piano Loop" },
                { type: "guitar", label: "🎸 Guitar Loop" },
                { type: "custom", label: "📤 Enviar MP3" },
              ].map((m) => (
                <button
                  key={m.type}
                  onClick={() => setMusicType(m.type as any)}
                  className={`py-2 px-2.5 rounded-xl border text-left font-sans transition cursor-pointer ${
                    musicType === m.type
                      ? "bg-[#4A5D4E] text-white border-[#4A5D4E]"
                      : "bg-[#FAF9F5] hover:bg-[#F0F2EE] border-[#E6E8E3] text-[#4A5D4E]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Custom file sender if selected */}
            {musicType === "custom" && (
              <div className="bg-[#FAF9F5] border border-dashed border-[#E6E8E3] rounded-2xl p-3 flex flex-col gap-2 mt-1">
                <p className="text-[10px] text-[#788A81] leading-tight">Envie uma música instrumental própria de sua preferência (.mp3):</p>
                <input
                  type="file"
                  accept="audio/mp3, audio/*"
                  onChange={handleMusicUpload}
                  disabled={audioUploadLoading}
                  className="text-[10px] text-stone-500 cursor-pointer w-full file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-semibold file:bg-amber-50 file:text-[#BF9B30] hover:file:bg-amber-100"
                />
                {audioUploadLoading && <span className="text-[9px] text-[#BF9B30] animate-pulse">A codificar áudio...</span>}
                {customAudioPayload && (
                  <span className="text-[10px] text-emerald-600 font-bold block truncate">✓ Selecionado: {customAudioPayload.name}</span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={handleGenerateMemory}
              disabled={generating || generatingFinal}
              className="w-full py-3 px-4 bg-[#4A5D4E] hover:bg-[#3E4F41] disabled:bg-zinc-300 text-white rounded-2xl font-bold font-sans text-xs transition duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>A processar rascunho...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>✨ Gerar / Atualizar Memória Rascunho</span>
                </>
              )}
            </button>

            <button
              onClick={handleCreateFinalMemory}
              disabled={generatingFinal || generating}
              className="w-full py-3 px-4 bg-[#BF9B30] hover:bg-[#A68628] disabled:bg-zinc-300 text-white rounded-2xl font-bold font-sans text-xs transition duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-xs"
            >
              {generatingFinal ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>A congelar memória...</span>
                </>
              ) : (
                <>
                  <Star className="w-4 h-4 text-white fill-current animate-pulse" />
                  <span>✨ Criar Memória Final (Congelada)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Existing memory preview controls card */}
        {memory ? (
          <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 shadow-xs flex flex-col gap-4 text-left animate-fade-in">
            <div className="flex items-start justify-between border-b border-[#F0F2EE] pb-2">
              <span className="text-[10px] uppercase font-bold text-[#BF9B30] tracking-wider flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 fill-[#BF9B30]/10" />
                {(memory as any).isFrozenFinal ? "🔒 Memória Final Congelada Ativa ✓" : "🌱 Rascunho Dinâmico Ativo ✓"}
              </span>
              <span className="text-[9px] text-stone-400 font-mono">Gerado em {new Date(memory.generatedAt).toLocaleDateString("pt-PT")}</span>
            </div>

            <p className="text-[11px] text-[#788A81] leading-relaxed">
              O álbum digital compilou <b>{memory.photos.length} fotografias</b>, <b>{memory.writtenMessages.length} dedicatórias</b> e <b>{memory.voiceMessages.length} áudios reais</b>. Pode partilhar o link ou descarregar as recordações do casamento nos botões em baixo:
            </p>

            {/* Downloader indicator spinner */}
            {downloadProgress && (
              <div className="bg-[#FAF9F5] border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-[10.5px] text-[#7A6B3D] animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#BF9B30]" />
                <span>{downloadProgress}</span>
              </div>
            )}

            {/* Operations Download matrix */}
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={exportCompleteEventZIP}
                className="py-4 px-4 bg-gradient-to-r from-[#BF9B30] to-[#E9C46A] hover:brightness-105 active:scale-[0.98] border border-[#BF9B30]/30 text-stone-900 font-extrabold text-xs rounded-xl shadow-xs transition duration-150 flex items-center justify-center gap-2 cursor-pointer font-sans"
              >
                <span>📦 Exportar Evento Completo</span>
              </button>

              <button
                onClick={downloadZIPPhotos}
                className="py-3 px-4 bg-[#FAF9F5] hover:bg-[#EBF0EC] border border-[#E6E8E3] text-[#4A5D4E] font-bold text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 cursor-pointer font-sans"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>📥 Descarregar Fotografias (ZIP)</span>
              </button>

              <button
                onClick={downloadPDFMemory}
                className="py-3 px-4 bg-[#FAF9F5] hover:bg-[#EBF0EC] border border-[#E6E8E3] text-[#4A5D4E] font-bold text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 cursor-pointer font-sans"
              >
                <FileText className="w-4 h-4 text-red-600" />
                <span>📝 Descarregar Mensagens (PDF)</span>
              </button>

              <button
                onClick={downloadZIPAudios}
                className="py-3 px-4 bg-[#FAF9F5] hover:bg-[#EBF0EC] border border-[#E6E8E3] text-[#4A5D4E] font-bold text-xs rounded-xl transition duration-150 flex items-center justify-center gap-2 cursor-pointer font-sans"
              >
                <Download className="w-4 h-4 text-amber-600" />
                <span>🎤 Descarregar Áudios (ZIP)</span>
              </button>

              <button
                onClick={downloadZIPCollection}
                className="py-2.5 px-4 bg-[#FAF9F5]/50 hover:bg-[#FAF9F5] text-stone-400 hover:text-stone-600 text-[10px] rounded-xl transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer font-sans"
              >
                <span>📦 Descarregar Tudo Juntos (ZIP)</span>
              </button>
            </div>

            {/* Quick Share with link */}
            <div className="flex gap-2 pt-2 border-t border-[#F0F2EE]">
              <input
                type="text"
                readOnly
                value={memoryShareUrl}
                className="flex-1 bg-[#FAF9F5] text-[10.5px] font-mono border border-[#E6E8E3] rounded-xl px-3 py-2 text-[#4A5D4E] select-all focus:outline-hidden"
              />
              <button
                onClick={handleCopyShareLink}
                className="py-2 px-3.5 bg-[#4A5D4E] hover:bg-[#3E4F41] text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedLink ? "Copiado!" : (
                  <>
                    <Clipboard className="w-3.5 h-3.5" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-[#FAF9F5] border border-[#E6E8E3] rounded-3xl p-6 text-center text-[#788A81] text-xs">
            Ainda não gerou a Memória Viva final para o casal. Configure o som e carregue em gerar acima! ✨
          </div>
        )}

      </div>
    );
  }

  // B. RETRIEVING THE PUBLIC GUEST PORTAL TIMELINE EXPERIENCE
  if (!journeyStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] px-4 py-8 text-center text-[#2F453A] font-sans bg-[#FAF9F5] select-none" id="guest-memory-landing">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-sm bg-white border border-[#E6E8E3] rounded-[32px] p-6 flex flex-col items-center gap-5 shadow-sm relative overflow-hidden animate-fade-in"
        >
          {/* Subtle elegant floral background decoration or watercolor styling */}
          <div className="w-full h-36 rounded-2xl overflow-hidden relative border border-[#E6E8E3] shadow-inner mb-1">
            <img 
              src={jasminsImage} 
              alt="Quinta dos Jasmins" 
              className="w-full h-full object-cover transform hover:scale-105 transition duration-1000"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
            <div className="absolute bottom-2.5 left-3 text-left">
              <span className="text-[9px] text-[#BF9B30] uppercase font-bold tracking-widest block">Quinta dos Jasmins</span>
              <p className="font-serif italic text-xs text-white">O Cenário do Nosso Amor</p>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-[#BF9B30] uppercase font-mono font-bold tracking-widest block">Momento Premium Rúben & Catarina</span>
            <h1 className="font-serif text-3xl font-light text-[#2F453A] leading-tight">Memória Viva</h1>
            <p className="text-[11px] text-[#788A81] leading-relaxed max-w-xs mx-auto pt-1">
              "Querido convidado, hoje não és apenas testemunha desta história — também fazes parte dela. Partilha as tuas fotografias e ajuda-nos a preservar os sorrisos, os abraços e os pequenos momentos que tornarão este dia inesquecível. 🤍💍"
            </p>
          </div>

          {memory ? (
            <div className="w-full space-y-4 pt-1">
              {/* Stats overview badge */}
              <div className="flex items-center justify-center gap-4 text-[10px] uppercase font-bold text-[#4A5D4E] bg-[#FAF9F5] py-2 px-3 rounded-full border border-[#E6E8E3]">
                <span className="flex items-center gap-1">📸 {memory.photos.length} Fotos</span>
                <span className="text-stone-300">•</span>
                <span className="flex items-center gap-1">✍️ {memory.writtenMessages.length} Votos</span>
                <span className="text-stone-300">•</span>
                <span className="flex items-center gap-1">🎤 {memory.voiceMessages.length} Áudios</span>
              </div>

              {/* Master Pathway: ✨ Entrar na Memória */}
              <button
                onClick={() => {
                  setJourneyStarted(true);
                  setIsInteractivePlayerOpen(true);
                }}
                className="w-full py-4 px-6 bg-[#4A5D4E] hover:bg-[#3E4F41] active:scale-[0.98] text-white rounded-2xl font-bold text-sm transition duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-md select-none border-b-2 border-[#2F453A]"
              >
                <Sparkles className="w-4 h-4 text-emerald-300" />
                <span>✨ Entrar na Memória</span>
              </button>

              <div className="w-full h-[1px] bg-[#E6E8E3] my-2" />

              {/* Memory Downloads cluster */}
              <div className="space-y-1.5 text-left pt-1">
                <span className="text-[9px] uppercase font-bold text-[#BF9B30] tracking-wider block mb-1 text-center font-sans">📥 Descarregar Recordações</span>
                
                {downloadProgress && (
                  <div className="bg-[#FAF9F5] border border-amber-200 rounded-xl p-2 flex items-center gap-2 text-[10px] text-[#7A6B3D] animate-pulse mb-2">
                    <Loader2 className="w-3 animate-spin text-[#BF9B30]" />
                    <span>{downloadProgress}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-1.5 text-xs">
                  <button
                    onClick={downloadZIPPhotos}
                    className="w-full py-2.5 px-3 bg-[#FAF9F5] hover:bg-[#F2F4F0] border border-[#E6E8E3] rounded-xl text-left flex items-center justify-between text-[#2F453A] transition cursor-pointer font-sans"
                  >
                    <span className="font-semibold text-[11px]">📸 Fotografias (ZIP)</span>
                    <Download className="w-3.5 h-3.5 text-[#BF9B30]" />
                  </button>

                  <button
                    onClick={downloadPDFMemory}
                    className="w-full py-2.5 px-3 bg-[#FAF9F5] hover:bg-[#F2F4F0] border border-[#E6E8E3] rounded-xl text-left flex items-center justify-between text-[#2F453A] transition cursor-pointer font-sans"
                  >
                    <span className="font-semibold text-[11px]">📝 Mensagens em PDF</span>
                    <FileText className="w-3.5 h-3.5 text-[#BF9B30]" />
                  </button>

                  <button
                    onClick={downloadZIPAudios}
                    className="w-full py-2.5 px-3 bg-[#FAF9F5] hover:bg-[#F2F4F0] border border-[#E6E8E3] rounded-xl text-left flex items-center justify-between text-[#2F453A] transition cursor-pointer font-sans"
                  >
                    <span className="font-semibold text-[11px]">🎤 Mensagens de Voz (ZIP)</span>
                    <Download className="w-3.5 h-3.5 text-[#BF9B30]" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl text-[11px] text-[#7A6B3D] leading-relaxed font-sans text-left flex gap-3">
              <span className="text-xl">⏳</span>
              <p>
                <b>O casal ainda está a compilar as recordações finais!</b><br />
                Volte mais tarde para navegar nesta emocionante viagem fotográfica e de voz coletiva de todos os convidados.
              </p>
            </div>
          )}

          <div className="pt-2">
            <button
              onClick={onNavigateHome}
              className="text-[10px] font-bold text-[#788A81] hover:text-[#2F453A] uppercase tracking-wider transition cursor-pointer"
            >
              ← Voltar ao Portal Principal
            </button>
            
            <p className="text-[9px] text-[#BF9B30] mt-3 tracking-widest uppercase font-bold">
              💍 Catarina & Rúben • 14 Junho 2026
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // Active Journey Player
  return (
    <div className="flex flex-col min-h-[calc(100vh-140px)] border-t border-[#F0F2EE] font-sans text-[#2F453A] bg-white animate-fade-in" id="memory-journey-screen">
      
      {/* 1. Header controls */}
      <div className="px-4 py-3 bg-white border-b border-stone-100 flex items-center justify-between">
        <button
          onClick={() => setJourneyStarted(false)}
          className="text-xs font-bold text-[#788A81] hover:text-[#2F453A] flex items-center gap-1 cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Sair</span>
        </button>

        {/* Soundtrack mute toggle */}
        <button
          onClick={() => setAudioMuted(!audioMuted)}
          className="p-2 bg-[#FAF9F5] hover:bg-[#F0F2EE] text-[#4A5D4E] border border-[#E6E8E3] rounded-xl transition cursor-pointer"
          title={audioMuted ? "Ligar música de fundo" : "Silenciar música"}
        >
          {audioMuted ? <VolumeX className="w-4 h-4 text-red-500 animate-pulse" /> : <Volume2 className="w-4 h-4 text-[#BF9B30]" />}
        </button>
      </div>

      {/* 2. Top Navigation for Segments */}
      <div className="flex bg-[#FAF9F5] border-b border-[#E6E8E3] p-1 font-sans overflow-x-auto whitespace-nowrap scrollbar-none">
        {[
          { id: "photos", label: "📸 Melhores Olhares" },
          { id: "texts", label: "✍️ Livro de Afetos" },
          { id: "voices", label: "🎤 Vozes Reais" },
          ...(memory && (memory.photos?.length > 0 || memory.writtenMessages?.length > 0) ? [{ id: "movie", label: "🎬 Filme Recordação" }] : [])
        ].map((seg) => (
          <button
            key={seg.id}
            onClick={() => {
              setActiveSegment(seg.id as any);
              if (seg.id !== "voices") {
                if (guestVoiceAudioRef.current) guestVoiceAudioRef.current.pause();
                setVoicePlayingId(null);
              }
            }}
            className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold transition duration-150 cursor-pointer ${
              activeSegment === seg.id 
                ? "bg-[#4A5D4E] text-white shadow-2xs" 
                : "text-[#788A81] hover:text-[#2F453A]"
            }`}
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* 3. Main Dynamic Content Renderer */}
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col justify-start">
        
        {/* SEGMENT A: PORTRAIT VIEW SLIDESHOW */}
        {activeSegment === "photos" && (
          <div className="flex flex-col items-center gap-4 animate-fade-in w-full max-w-sm mx-auto">
            {memory && memory.photos.length > 0 ? (
              <div className="w-full space-y-4">
                
                {/* Image panel */}
                <div className="relative aspect-square bg-[#FAF9F5] rounded-3xl overflow-hidden ring-1 ring-[#E6E8E3] shadow-md flex items-center justify-center group">
                  <picture>
                    <img
                      src={memory.photos[slideIndex].imageUrl}
                      alt="Momentia slide show"
                      className="w-full h-full object-cover transition-all duration-700 block scale-101 group-hover:scale-104"
                    />
                  </picture>

                  {/* Highlights tag */}
                  {memory.photos[slideIndex].favorite && (
                    <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/60 text-[9px] text-amber-600 font-bold tracking-wide flex items-center gap-1 shadow-2xs">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500 animate-spin-pulse" />
                      <span>DESTAQUE CASAL</span>
                    </div>
                  )}

                  {/* Footer overlay containing credits */}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 text-white text-left text-xs font-sans">
                    <span className="block font-bold">Por: {memory.photos[slideIndex].author}</span>
                    <span className="block text-[10px] text-zinc-300 capitalize mt-0.5">Mural: {memory.photos[slideIndex].category}</span>
                  </div>
                </div>

                {/* Slideshow controller toolbar */}
                <div className="flex items-center justify-between px-2 font-sans">
                  <button
                    onClick={() => {
                      setIsAutoPlay(false);
                      setSlideIndex((prev) => (prev - 1 + memory.photos.length) % memory.photos.length);
                    }}
                    className="p-2 py-2.5 bg-[#FAF9F5] hover:bg-[#EBF0EC] border border-[#E6E8E3] text-[#4A5D4E] font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <div className="text-center">
                    <button
                      onClick={() => setIsAutoPlay(!isAutoPlay)}
                      className="px-4 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-[10px] font-bold transition hover:bg-amber-100 uppercase tracking-widest cursor-pointer"
                    >
                      {isAutoPlay ? "⏸ Pausar Slideshow" : "▶ Autoplay"}
                    </button>
                    <span className="block text-[10px] text-[#788A81] mt-1 font-semibold">{slideIndex + 1} / {memory.photos.length} fotografias</span>
                  </div>

                  <button
                    onClick={() => {
                      setIsAutoPlay(false);
                      setSlideIndex((prev) => (prev + 1) % memory.photos.length);
                    }}
                    className="p-2 py-2.5 bg-[#FAF9F5] hover:bg-[#EBF0EC] border border-[#E6E8E3] text-[#4A5D4E] font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-[#788A81] text-xs italic py-8 text-center">Nenhuma fotografia compilada no Álbum.</p>
            )}
          </div>
        )}

        {/* SEGMENT B: WRITTEN MEMENTOS */}
        {activeSegment === "texts" && (
          <div className="space-y-3 max-w-sm mx-auto w-full text-left animate-fade-in">
            {memory && memory.writtenMessages.length > 0 ? (
              memory.writtenMessages.map((msg) => (
                <div key={msg.id} className="bg-white border border-[#E6E8E3] rounded-2xl p-4.5 shadow-2xs relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-12 h-12 bg-[#FAF9F5] rounded-full -mr-5 -mt-5" />
                  <span className="text-[9.5px] font-bold text-stone-400 block tracking-wide uppercase">✍️ De {msg.author}</span>
                  <p className="font-serif italic text-sm text-[#2F453A] mt-1.5 leading-relaxed">
                    "{msg.text}"
                  </p>
                </div>
              ))
            ) : (
              <p className="text-[#788A81] text-xs italic py-8 text-center leading-normal">Nenhum voto escrito compilado.</p>
            )}
          </div>
        )}

        {/* SEGMENT C: MICRO VOICE GALLERY */}
        {activeSegment === "voices" && (
          <div className="space-y-2 max-w-sm mx-auto w-full text-left animate-fade-in">
            {memory && memory.voiceMessages.length > 0 ? (
              memory.voiceMessages.map((voice) => (
                <div key={voice.id} className="bg-white border border-[#E6E8E3] rounded-2xl p-4.5 flex items-center justify-between gap-4 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-amber-50/80 rounded-full flex items-center justify-center text-amber-700 shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-[#2F453A] block">🎤 {voice.author}</span>
                      <span className="text-[10px] text-[#788A81] block mt-0.5">Mensagem de voz • {voice.duration ? voice.duration.toFixed(1) : "4.5"}s</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleVoiceListen(voice.id, voice.audioUrl)}
                    className="h-10 w-10 bg-[#FAF9F5] hover:bg-[#EBF0EC] text-[#4A5D4E] border border-[#E6E8E3] rounded-full flex items-center justify-center transition active:scale-95 cursor-pointer"
                  >
                    {voicePlayingId === voice.id ? <Pause className="w-4 h-4 text-[#BF9B30]" /> : <Play className="w-4 h-4 text-[#BF9B30] fill-current" />}
                  </button>
                </div>
              ))
            ) : (
              <p className="text-[#788A81] text-xs italic py-8 text-center leading-normal">Nenhuma mensagem viva de voz compilada.</p>
            )}
          </div>
        )}

        {/* SEGMENT D: CINEMATIC MOVIE PLAYER & CHOICES */}
        {activeSegment === "movie" && memory && (
          <div className="flex flex-col items-center gap-5 animate-fade-in w-full max-w-lg mx-auto text-left font-sans">
            
            {/* Header / Intro Card */}
            <div className="w-full bg-[#111A15] text-white rounded-3xl p-6 border border-[#2F453A] shadow-xl space-y-3 relative overflow-hidden">
              <span className="text-[9px] bg-emerald-500/10 border border-emerald-500/20 text-[#BF9B30] px-2.5 py-0.5 rounded-full uppercase font-bold tracking-widest inline-block">
                Documentário Cinematográfico MP4
              </span>
              <h3 className="font-serif text-2xl font-light text-stone-100">O Filme das Nossas Memórias</h3>
              <p className="text-[11px] text-stone-300 leading-relaxed">
                Este documentário compila as fotografias dos nossos convidados por ordem cronológica, estampa os seus votos de casamento e mistura as vossas mensagens de voz com a banda sonora oficial de Calum Scott!
              </p>
            </div>

            {/* IF STATUS IS GENERATING (Cloud Functions Simulation/Listen) */}
            {memory.movieStatus === "generating" ? (
              <div className="w-full bg-[#1C2C24] text-white border border-[#2F453A] rounded-3xl p-6 space-y-5 shadow-lg animate-pulse">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-[#BF9B30]" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#BF9B30]">Servidor Activo (FFmpeg Cloud)</p>
                    <p className="text-[10px] text-stone-300">A processar o filme de casamento assincronamente...</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-stone-300 truncate max-w-[280px]">⚡ {memory.movieStatusText || "A gerar..."}</span>
                    <span className="text-[#BF9B30] font-mono">{memory.movieProgressPercent || 0}%</span>
                  </div>
                  <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
                    <div 
                      className="h-full bg-gradient-to-r from-[#BF9B30] to-emerald-500 transition-all duration-300"
                      style={{ width: `${memory.movieProgressPercent || 0}%` }}
                    />
                  </div>
                </div>

                <div className="text-[10px] text-stone-400 bg-black/30 p-3 rounded-xl font-mono leading-relaxed space-y-1">
                  <p className="text-[#BF9B30] font-bold">● CLOUD_FUNCTION_PIPELINE: LIVE</p>
                  <p>&gt; FFmpeg H.264 Encoder iniciado com sucesso</p>
                  <p>&gt; A descarregar banda sonora oficial (Calum Scott - You Are The Reason)...</p>
                  <p>&gt; Mesclando fotos dos convidados com vozes reais de boda...</p>
                </div>
              </div>
            ) : memory.movieUrl ? (
              <div className="w-full bg-[#FAF9F5] border border-[#E6E8E3] rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-stone-500">
                  <span>🎬</span>
                  <span className="text-[10.5px] uppercase font-bold tracking-wider text-[#4A5D4E]">Assistir ou Descarregar MP4</span>
                </div>

                <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-stone-200 shadow-xs">
                  <video
                    src={memory.movieUrl}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex gap-2">
                  <a
                    href={memory.movieUrl}
                    download={
                      memory.movieUrl?.includes(".mp4")
                        ? "filme_memorias_casamento.mp4"
                        : memory.movieUrl?.includes(".mov")
                        ? "filme_memorias_casamento.mov"
                        : "filme_memorias_casamento.webm"
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-3.5 px-4 bg-gradient-to-r from-[#BF9B30] to-[#E9C46A] hover:brightness-110 text-stone-950 font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer text-center shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Descarregar Ficheiro de Vídeo</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="w-full bg-stone-50 border border-stone-200/80 rounded-3xl p-6 text-center space-y-1.5">
                <span className="text-2xl block">🎬</span>
                <p className="text-xs text-[#2F453A] font-medium leading-normal">
                  O rolo de filme das recordações está a ser gerado pelos noivos!
                </p>
                <p className="text-[10px] text-stone-400">
                  Assim que os noivos gerarem o filme final via FFmpeg no painel administrativo, o MP4 estará pronto neste espaço para ver e descarregar.
                </p>
              </div>
            )}

          </div>
        )}

      </div>

      {/* 4. Elegant Guest Portal Downloads Footer */}
      <div className="p-4 bg-[#FAF9F5] border-t border-[#E6E8E3] text-center font-sans space-y-3.5">
        <p className="text-[10px] text-[#788A81] uppercase font-bold tracking-widest">Colecionar Recordação Física do Casal</p>
        
        {downloadProgress ? (
          <div className="py-2.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-[10.5px] font-semibold animate-pulse">
            {downloadProgress}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              onClick={downloadPDFMemory}
              className="py-2 px-2 border border-[#E6E8E3] hover:bg-[#EBF0EC] bg-white text-[#4A5D4E] font-bold rounded-xl transition cursor-pointer flex flex-col items-center gap-1 shrink-0"
            >
              <FileText className="w-4 h-4 text-red-500" />
              <span className="text-[9px]">Livro PDF</span>
            </button>
            <button
              onClick={downloadZIPCollection}
              className="py-2 px-2 border border-[#E6E8E3] hover:bg-[#EBF0EC] bg-white text-[#4A5D4E] font-bold rounded-xl transition cursor-pointer flex flex-col items-center gap-1 shrink-0"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span className="text-[9px]">Anexos ZIP</span>
            </button>
            <button
              onClick={downloadCompleteStandaloneHTML}
              className="py-2 px-2 border border-amber-200 hover:bg-amber-100 bg-amber-50 text-[#7A6B3D] font-bold rounded-xl transition cursor-pointer flex flex-col items-center gap-1 shrink-0"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-[9px]">Livro Virtual</span>
            </button>
          </div>
        )}
      </div>

      {isInteractivePlayerOpen && memory && (
        <InteractiveMoviePlayer 
          memory={memory} 
          onClose={() => setIsInteractivePlayerOpen(false)} 
        />
      )}

    </div>
  );
}
