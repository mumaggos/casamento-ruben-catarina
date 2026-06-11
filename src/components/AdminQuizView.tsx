/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Sparkles, Lock, ShieldCheck, Play, Pause, ChevronRight, 
  Trash2, RefreshCw, Trophy, Users, CheckCircle2, AlertCircle, Printer, Award, Heart, HelpCircle, Download, QrCode, Monitor
} from "lucide-react";
import { collection, onSnapshot, doc, setDoc, writeBatch, deleteDoc, getDocs, query, orderBy } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Photo, Message } from "../types";
import { motion, AnimatePresence } from "motion/react";
import MemoryView from "./MemoryView";
import QRCode from "qrcode";
import JSZip from "jszip";
import { jsPDF } from "jspdf";

interface QuizState {
  currentQuestionIndex: number; // 0 to 29 (representing Pergunta 1 to 30)
  status: "idle" | "running" | "paused" | "ended";
  timerDuration: number;
  timerStartedAt?: any; // Firestore Timestamp or null
  revealWinners?: boolean;
  winners?: number[]; // [1st, 2nd, 3rd] place table numbers
  correctAnswers?: { [questionId: string]: "A" | "B" | "C" };
  ceremonyStep?: "idle" | 3 | 2 | 1;
}

interface QuizAnswer {
  id: string; // mesa_X_q_Y
  tableNumber: number;
  questionId: string; // q_Y
  answer: "A" | "B" | "C";
  submittedAt: any;
  timeTakenSecs: number;
}

export default function AdminQuizView() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem("wedding_quiz_admin_authed") === "true";
  });
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");

  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showA4Print, setShowA4Print] = useState(false);
  
  // Base access URL domain for QR Codes: can be customized on screen and persists in localStorage
  const [qrBaseUrl, setQrBaseUrl] = useState<string>(() => {
    const stored = localStorage.getItem("wedding_quiz_qr_base_url");
    // Migrate or overwrite outdated default URL
    if (stored && stored !== "https://casamento-ruben-catarina.vercel.app") return stored;
    const currentHost = window.location.origin;
    if (currentHost.includes("ais-") || currentHost.includes("localhost") || currentHost.includes("127.0.0.1") || currentHost.includes("vercel.app")) {
      return "https://momentios.me";
    }
    return currentHost;
  });

  // Client-side generated Base64 Data URLs for both printing and downloading offline HTML
  const [qrDataUrls, setQrDataUrls] = useState<{ [tableNum: number]: string }>({});
  const [mainQrDataUrl, setMainQrDataUrl] = useState<string>("");
  const [showMainQrModal, setShowMainQrModal] = useState<boolean>(false);

  // Memories admin state
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGeneratingZip, setIsGeneratingZip] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Modular live moderation states
  const [moderationTab, setModerationTab] = useState<"photos" | "texts" | "voices">("photos");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<{ [id: string]: number }>({});

  // Navigation structure for Admin: "quiz" (first view/active quiz) | "moderation" (photos, comments, audio) | "memories" (Momentia compile)
  const [adminPage, setAdminPage] = useState<"quiz" | "moderation" | "memories">("quiz");

  useEffect(() => {
    const qPhotos = query(collection(db, "photos"), orderBy("createdAt", "desc"));
    const unsubPhotos = onSnapshot(qPhotos, (snapshot) => {
      const list: Photo[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Photo);
      });
      setPhotos(list);
    }, (err) => console.error("Error loading photos:", err));

    const qMessages = query(collection(db, "messages"), orderBy("createdAt", "desc"));
    const unsubMessages = onSnapshot(qMessages, (snapshot) => {
      const list: Message[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(list);
    }, (err) => console.error("Error loading messages:", err));

    return () => {
      unsubPhotos();
      unsubMessages();
    };
  }, []);

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("Tem a certeza de que deseja apagar permanentemente esta fotografia do álbum? Ação imediata e sem retorno.")) return;
    try {
      await deleteDoc(doc(db, "photos", photoId));
      alert("Fotografia apagada com sucesso!");
    } catch (err) {
      console.error("Error deleting photo:", err);
      alert("Erro ao apagar fotografia.");
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!confirm("Tem a certeza de que deseja apagar permanentemente esta mensagem do Livro de Honra? Ação imediata e definitiva.")) return;
    try {
      await deleteDoc(doc(db, "messages", msgId));
      alert("Mensagem eliminada com sucesso!");
    } catch (err) {
      console.error("Error deleting message:", err);
      alert("Erro ao eliminar a mensagem.");
    }
  };

  const handlePlayVoice = (messageId: string, base64Audio: string) => {
    if (playingId === messageId) {
      if (activeAudio) {
        activeAudio.pause();
        setPlayingId(null);
      }
    } else {
      if (activeAudio) {
        activeAudio.pause();
      }

      const audio = new Audio(base64Audio);
      audio.onended = () => {
        setPlayingId(null);
        setPlaybackProgress((prev) => ({ ...prev, [messageId]: 100 }));
      };

      audio.ontimeupdate = () => {
        if (audio.duration) {
          const progress = (audio.currentTime / audio.duration) * 100;
          setPlaybackProgress((prev) => ({ ...prev, [messageId]: progress }));
        }
      };

      audio.play();
      setActiveAudio(audio);
      setPlayingId(messageId);
    }
  };

  useEffect(() => {
    return () => {
      if (activeAudio) {
        activeAudio.pause();
      }
    };
  }, [activeAudio]);

  const handleDownloadZip = async () => {
    if (photos.length === 0 && messages.length === 0) {
      alert("Não há dados de fotos ou mensagens para empacotar.");
      return;
    }
    setIsGeneratingZip(true);
    try {
      const zip = new JSZip();
      
      // 1. Photos folder
      const photosFolder = zip.folder("Fotos");
      photos.forEach((photo, idx) => {
        const cleanAuthor = photo.author.replace(/[^a-zA-Z0-9-_\s]/g, "").trim() || "Convidado";
        const fileName = `foto_${idx + 1}_${cleanAuthor}.jpg`;
        const base64Parts = photo.imageUrl.split(",");
        const base64Data = base64Parts[1] || base64Parts[0];
        if (base64Data) {
          photosFolder?.file(fileName, base64Data, { base64: true });
        }
      });

      // 2. Messages Text folder
      const textFolder = zip.folder("MensagensTexto");
      const textMsgs = messages.filter(m => m.text && m.text.trim() !== "");
      let unifiedText = "PORTAL DE CASAMENTO - MENSAGENS DOS CONVIDADOS\n";
      unifiedText += "==============================================\n\n";
      
      textMsgs.forEach((msg, idx) => {
        let timeStr = "Data Indisponível";
        if (msg.createdAt) {
          try {
            timeStr = msg.createdAt.toDate ? msg.createdAt.toDate().toLocaleString() : new Date(msg.createdAt).toLocaleString();
          } catch(e) {}
        }
        const cleanAuthor = msg.author.replace(/[^a-zA-Z0-9-_\s]/g, "").trim() || "Convidado";
        const itemText = `De: ${msg.author}\nData: ${timeStr}\nMensagem:\n${msg.text}\n\n----------------------------------------------\n\n`;
        unifiedText += itemText;

        const fileContent = `DE: ${msg.author}\nDATA: ${timeStr}\n\nMENSAGEM:\n${msg.text}\n`;
        textFolder?.file(`mensagem_${idx + 1}_${cleanAuthor}.txt`, fileContent);
      });
      zip.file("Todas_as_Mensagens_Texto.txt", unifiedText);

      // 3. Messages Audio folder
      const audioFolder = zip.folder("MensagensAudio");
      const audioMsgs = messages.filter(m => m.hasAudio && m.audioUrl);
      audioMsgs.forEach((msg, idx) => {
        const cleanAuthor = msg.author.replace(/[^a-zA-Z0-9-_\s]/g, "").trim() || "Convidado";
        const base64Parts = msg.audioUrl!.split(",");
        const base64Data = base64Parts[1] || base64Parts[0];
        
        let ext = "webm";
        if (msg.audioUrl!.includes("audio/mp4") || msg.audioUrl!.includes("audio/m4a") || msg.audioUrl!.includes("audio/x-m4a")) ext = "m4a";
        else if (msg.audioUrl!.includes("audio/mpeg") || msg.audioUrl!.includes("audio/mp3")) ext = "mp3";
        else if (msg.audioUrl!.includes("audio/wav") || msg.audioUrl!.includes("audio/x-wav")) ext = "wav";
        else if (msg.audioUrl!.includes("audio/aac")) ext = "aac";
        else if (msg.audioUrl!.includes("audio/ogg") || msg.audioUrl!.includes("audio/opus")) ext = "ogg";
        else if (msg.audioUrl!.includes("audio/3gpp") || msg.audioUrl!.includes("audio/3gp")) ext = "3gp";

        const fileName = `audio_${idx + 1}_${cleanAuthor}.${ext}`;
        if (base64Data) {
          audioFolder?.file(fileName, base64Data, { base64: true });
        }
      });

      // 4. Instructional README for Audio Playback on all devices (especially iOS/Mac)
      const readmeText = `COMO OUVIR AS MENSAGENS DE VOZ (.webm ou .m4a)
==============================================

Se tiver dificuldades em reproduzir os ficheiros de áudio desta pasta no seu computador ou telemóvel (especialmente em dispositivos Apple/iOS que não suportam nativamente o formato WebM por padrão):

1. ABRIR COM O NAVEGADOR:
   Arraste qualquer ficheiro de áudio (.webm) diretamente para o seu navegador de Internet (Google Chrome, Apple Safari, Microsoft Edge ou Firefox). Todos eles têm suporte de reprodução integrada para ficheiros de voz.

2. LEITOR VLC GRATUITO:
   Pode descarregar e utilizar o software gratuito e multiplataforma "VLC Media Player" (disponível para Windows, macOS, Android e iOS), que lê instantaneamente qualquer formato de áudio existente no mundo.

Formato original das gravações: WebM Audio / AAC MPEG-4.
Casamento de Rúben & Catarina • 14 de Junho de 2026.
`;
      zip.file("COMO_OUVIR_OS_AUDIOS.txt", readmeText);

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `Casamento_Ruben_Catarina_Memorias_Completas.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Error generating memories ZIP:", error);
      alert("Erro ao empacotar memórias no ficheiro ZIP.");
    } finally {
      setIsGeneratingZip(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
      });

      let pageCount = 1;

      // Helper function to strip emojis and high-unicode symbols that break standard default jsPDF fonts
      const cleanTextForPDF = (str: string): string => {
        if (!str) return "";
        return str.replace(/[\u1F600-\u1F64F\u1F300-\u1F5FF\u1F680-\u1F6FF\u1F1E0-\u1F1FF\u2700-\u27BF\u1F900-\u1F9FF\u1F100-\u1F1FF\u2600-\u26FF\u1F100-\u1F1FF\u2300-\u23FF\u2000-\u3300]/g, "");
      };

      // Helper functions
      const addHeader = (title: string) => {
        doc.setFont("times", "bold");
        doc.setFontSize(20);
        doc.setTextColor(47, 69, 58); // #2F453A
        doc.text(title, 20, 24);
        
        doc.setDrawColor(191, 155, 48); // #BF9B30
        doc.setLineWidth(0.4);
        doc.line(20, 27, 190, 27);
      };

      const addFooter = (pNum: number) => {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(120, 138, 129); // #788A81
        doc.text("Ruben & Catarina - Album de Memorias do Casamento", 20, 285);
        doc.text(`Pagina ${pNum}`, 180, 285);
      };

      // --- PAGE 1: COVER ---
      doc.setFillColor(47, 69, 58); // #2F453A
      doc.rect(0, 0, 210, 297, "F");

      // Gold frame
      doc.setDrawColor(191, 155, 48); // #BF9B30
      doc.setLineWidth(1.2);
      doc.rect(10, 10, 190, 277);

      doc.setTextColor(255, 255, 255);
      doc.setFont("times", "italic");
      doc.setFontSize(38);
      doc.text("Album de Memorias", 105, 95, { align: "center" });

      doc.setFont("times", "normal");
      doc.setFontSize(16);
      doc.setTextColor(191, 155, 48);
      doc.text("DIGITAL & IMPRESSO", 105, 110, { align: "center" });

      doc.setDrawColor(191, 155, 48);
      doc.setLineWidth(0.5);
      doc.line(75, 120, 135, 120);

      doc.setTextColor(255, 255, 255);
      doc.setFont("times", "bold");
      doc.setFontSize(32);
      doc.text("Ruben & Catarina", 105, 145, { align: "center" });

      doc.setFont("times", "italic");
      doc.setFontSize(16);
      doc.text("14 de Junho de 2026", 105, 158, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(180, 180, 180);
      doc.text("Ficheiro Oficial de Recordacoes Coletadas dos Convidados", 105, 260, { align: "center" });

      // --- PAGE 2: SUMMARY STATS & CRONOLOGIA ---
      doc.addPage();
      pageCount++;
      addHeader("Cronologia do Casamento & Resumo");
      
      doc.setFont("times", "italic");
      doc.setFontSize(13);
      doc.setTextColor(80, 100, 90);
      doc.text("Guia para recordar cada horario memoravel do nosso casamento", 20, 34);

      const timelineItems = [
        { t: "12:30", e: "Rececao de Convidados e Welcome Drink" },
        { t: "13:30", e: "Cerimonia Estilo Boho na Quinta dos Jasmins" },
        { t: "14:30", e: "Banquete de Casamento e Brindes dos Noivos" },
        { t: "16:00", e: "Corte do Bolo de Casamento e Champanhe" },
        { t: "17:30", e: "Sessao de Quiz Interativo da Familia" },
        { t: "19:00", e: "Abertura da Pista de Danca com o DJ" }
      ];

      let yOffset = 46;
      timelineItems.forEach((item) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(191, 155, 48);
        doc.text(item.t, 25, yOffset);
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(47, 69, 58);
        doc.text(item.e, 45, yOffset);

        doc.setDrawColor(240, 242, 238);
        doc.setLineWidth(0.2);
        doc.line(25, yOffset + 6, 185, yOffset + 6);
        yOffset += 16;
      });

      yOffset += 10;
      doc.setFillColor(244, 246, 242);
      doc.roundedRect(20, yOffset, 170, 52, 6, 6, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(47, 69, 58);
      doc.text("Estatisticas das Nossas Memorias", 28, yOffset + 10);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(80, 100, 90);
      doc.text(`- Fotografias capturadas em tempo real:  ${photos.length} fotos`, 28, yOffset + 21);
      doc.text(`- Dedicatorias escritas recebidas:          ${messages.filter(m => !m.hasAudio).length} mensagens`, 28, yOffset + 28);
      doc.text(`- Registos de audios recebidos:             ${messages.filter(m => m.hasAudio).length} gravacoes de som`, 28, yOffset + 35);
      doc.text(`- Total de ficheiros no arquivo ZIP:        ${photos.length + messages.length} elementos`, 28, yOffset + 42);
      addFooter(pageCount);

      // --- PAGE 3+: PHOTOS ALBUM ---
      if (photos.length > 0) {
        let currentPhotoIdx = 0;
        while (currentPhotoIdx < photos.length) {
          doc.addPage();
          pageCount++;
          addHeader(`Fotomemorias dos Convidados - Parte ${Math.floor(currentPhotoIdx / 2) + 1}`);

          for (let i = 0; i < 2; i++) {
            if (currentPhotoIdx >= photos.length) break;
            const photo = photos[currentPhotoIdx];
            const boxY = 38 + (i * 116);

            // Container Box
            doc.setFillColor(250, 249, 245);
            doc.roundedRect(20, boxY, 170, 106, 5, 5, "F");
            doc.setDrawColor(230, 232, 227);
            doc.setLineWidth(0.3);
            doc.roundedRect(20, boxY, 170, 106, 5, 5, "S");

            try {
              doc.addImage(photo.imageUrl, "JPEG", 55, boxY + 6, 100, 75, undefined, "FAST");
            } catch (err) {
              doc.setDrawColor(200, 200, 200);
              doc.rect(55, boxY + 6, 100, 75);
              doc.setFontSize(10);
              doc.setTextColor(150, 150, 150);
              doc.text("[Compressao local - Foto salva no ZIP]", 105, boxY + 44, { align: "center" });
            }

            // Photo author info
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(47, 69, 58);
            doc.text(`Fotografia por: ${cleanTextForPDF(photo.author)}`, 26, boxY + 91);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            doc.setTextColor(191, 155, 48);
            
            let timeStr = "Data Indisponivel";
            if (photo.createdAt) {
              try {
                timeStr = photo.createdAt.toDate ? photo.createdAt.toDate().toLocaleDateString() : new Date(photo.createdAt).toLocaleDateString();
              } catch(e){}
            }
            doc.text(`Categoria: ${photo.category.toUpperCase()}   •   Data: ${timeStr}   •   Likes: ${photo.likesCount || 0}`, 26, boxY + 97);

            currentPhotoIdx++;
          }
          addFooter(pageCount);
        }
      }

      // --- PAGE X: MESSAGES ---
      if (messages.length > 0) {
        let isFirstMsgPage = true;
        let yMsgOffset = 38;
        
        messages.forEach((msg, idx) => {
          const contentText = msg.text ? cleanTextForPDF(msg.text) : `[Mensagem de Audio enviada por ${cleanTextForPDF(msg.author)} - Disponivel no ficheiro ZIP]`;
          const wordWrapMsg = doc.splitTextToSize(contentText, 158);
          const textHeight = wordWrapMsg.length * 4.4;
          const totalHeightNeeded = 20 + textHeight;

          if (isFirstMsgPage || yMsgOffset + totalHeightNeeded > 265) {
            doc.addPage();
            pageCount++;
            addHeader("Livro de Honra - Mensagens Escritas");
            isFirstMsgPage = false;
            yMsgOffset = 38;
          }

          // Message Card Frame
          doc.setFillColor(250, 249, 245);
          doc.roundedRect(20, yMsgOffset, 170, totalHeightNeeded, 4, 4, "F");
          doc.setDrawColor(230, 232, 227);
          doc.setLineWidth(0.2);
          doc.roundedRect(20, yMsgOffset, 170, totalHeightNeeded, 4, 4, "S");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(47, 69, 58);
          doc.text(`De: ${cleanTextForPDF(msg.author)}`, 26, yMsgOffset + 6.5);

          doc.setFont("helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(120, 138, 129);
          
          let timeStr = "";
          if (msg.createdAt) {
            try {
              timeStr = msg.createdAt.toDate ? msg.createdAt.toDate().toLocaleDateString() : new Date(msg.createdAt).toLocaleDateString();
            } catch(e){}
          }
          doc.text(timeStr, 184, yMsgOffset + 6, { align: "right" });

          doc.setDrawColor(191, 155, 48, 0.3);
          doc.setLineWidth(0.3);
          doc.line(26, yMsgOffset + 10, 184, yMsgOffset + 10);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9.5);
          doc.setTextColor(55, 55, 55);
          doc.text(wordWrapMsg, 26, yMsgOffset + 16);

          yMsgOffset += totalHeightNeeded + 6;
        });
        addFooter(pageCount);
      }

      doc.save(`Casamento_Ruben_Catarina_Album_Seguro.pdf`);
    } catch (error) {
      console.error("Error generating PDF memories album: ", error);
      alert("Erro ao criar o álbum PDF digital.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  useEffect(() => {
    const generateQRs = async () => {
      // 1. Generate main site general portal QR code
      const cleanBase = qrBaseUrl.replace(/\/$/, ""); // strips trailing slash if any
      try {
        const mDataUrl = await QRCode.toDataURL(cleanBase, {
          margin: 1,
          width: 512,
          color: {
            dark: "#2F453A",
            light: "#FFFFFF"
          }
        });
        setMainQrDataUrl(mDataUrl);
      } catch (err) {
        console.error("Error generating main wedding portal QR:", err);
      }

      // 2. Generate table deep link QR codes
      const urls: { [tableNum: number]: string } = {};
      for (let tableNum = 1; tableNum <= 12; tableNum++) {
        const tableUrl = `${cleanBase}/quiz?mesa=${tableNum}`;
        try {
          const dataUrl = await QRCode.toDataURL(tableUrl, {
            margin: 1,
            width: 360,
            color: {
              dark: "#2F453A", // matches the gorgeous wedding green!
              light: "#FFFFFF"
            }
          });
          urls[tableNum] = dataUrl;
        } catch (err) {
          console.error(`Error generating QR for table ${tableNum}:`, err);
        }
      }
      setQrDataUrls(urls);
    };
    generateQRs();
  }, [qrBaseUrl]);
  
  // Results Ceremony stages: "idle" | 3 | 2 | 1 (showing 3rd, 2nd, or 1st place)
  const [resultsCeremonyStep, setResultsCeremonyStep] = useState<"idle" | 3 | 2 | 1>("idle");

  // Authenticate DJ
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput.trim() === "RC1406") {
      localStorage.setItem("wedding_quiz_admin_authed", "true");
      setIsAuthenticated(true);
      setAuthError("");
    } else {
      setAuthError("Palavra-passe errada! Introduza a password correta para aceder.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("wedding_quiz_admin_authed");
    setIsAuthenticated(false);
  };

  // Real offline-ready download package for the A4 Sheet
  const handleDownloadHTML = () => {
    const title = "Casamento_Ruben_Catarina_Quiz_A4.html";
    let placesHTML = "";
    for (let tableNum = 1; tableNum <= 12; tableNum++) {
      const qrDataUrl = qrDataUrls[tableNum] || "";
      placesHTML += `
        <div style="border: 2px dashed #BF9B30; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; background: white; height: 60mm; box-sizing: border-box; position: relative;">
          <div style="position: absolute; top: 6px; left: 6px; right: 6px; bottom: 6px; border: 1px solid rgba(191,155,48,0.2); border-radius: 12px; pointer-events: none;"></div>
          <div style="z-index: 10;">
            <span style="font-size: 8px; font-weight: bold; letter-spacing: 0.15em; color: #BF9B30; font-family: 'Inter', sans-serif;">MESA</span>
            <h4 style="font-family: 'Georgia', serif; font-size: 24px; font-weight: bold; color: #2F453A; margin: 2px 0 0 0; line-height: 1;">${tableNum}</h4>
          </div>
          <div style="width: 28mm; height: 28mm; display: flex; align-items: center; justify-content: center; padding: 4px; background: white; border: 1px solid #E6E8E3; border-radius: 12px; z-index: 10; box-sizing: border-box;">
            <!-- Prefetched high-definition Base64 encoded QR matrix (guarantees offline availability & works on iOS Safari) -->
            <img src="${qrDataUrl}" alt="QR Mesa ${tableNum}" style="width: 100%; height: 100%; object-fit: contain; display: block;" />
          </div>
          <div style="z-index: 10;">
            <p style="font-size: 7px; font-weight: bold; color: #2F453A; text-transform: uppercase; letter-spacing: 0.05em; margin: 0; font-family: 'Inter', sans-serif;">Leiam o Código QR para Jogar!</p>
            <p style="font-size: 7.5px; color: #788A81; font-style: italic; font-family: 'Georgia', serif; margin: 4px 0 0 0;">Rúben & Catarina • 14.06.2026</p>
          </div>
        </div>
      `;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Códigos QR Quiz - Rúben & Catarina</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f5f5f4;
      font-family: 'Inter', sans-serif;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .no-print-bar {
      background: #4A5D4E;
      color: white;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 4px 10px rgba(0,0,0,0.15);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .btn {
      background: #BF9B30;
      color: white;
      border: none;
      padding: 10px 20px;
      font-weight: bold;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
    }
    .btn:hover {
      background: #A68628;
    }
    .a4-page {
      background: white;
      width: 210mm;
      height: 297mm;
      padding: 10mm;
      box-sizing: border-box;
      margin: 40px auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
      position: relative;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 1px dashed #E6E8E3;
      padding-bottom: 8px;
    }
    .header h1 {
      font-family: 'Georgia', serif;
      font-size: 16px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #2F453A;
      margin: 0;
    }
    .header p {
      font-size: 9px;
      color: #788A81;
      margin: 4px 0 0 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(4, 1fr);
      gap: 4mm;
      height: 252mm;
    }
    @media print {
      body {
        background: white;
      }
      .no-print {
        display: none !important;
      }
      .a4-page {
        margin: 0 !important;
        box-shadow: none !important;
        width: 210mm;
        height: 297mm;
        padding: 10mm !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-bar no-print">
    <div style="text-align: left;">
      <h3 style="margin: 0; font-size: 15px; font-weight: normal; font-family: 'Georgia', serif; color: #FFEAA7;">Imprimir Códigos QR de Mesas (Offline-Ready)</h3>
      <p style="margin: 4px 0 0 0; font-size: 11px; color: #A3B1AA;">Utilize este documento para recortar e dispor um QR Code no centro de cada uma das 12 mesas. Os códigos estão totalmente embutidos em alta definição.</p>
    </div>
    <button class="btn" onclick="window.print()">Imprimir / Guardar como PDF 🖨️</button>
  </div>

  <div class="a4-page">
    <div class="header">
      <h1>Casamento de Rúben & Catarina</h1>
      <p>Quiz ao Vivo • Recorte pelas linhas tracejadas e coloque nas mesas.</p>
    </div>
    <div class="grid">
      ${placesHTML}
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = title;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sync state and answers from Firestore
  useEffect(() => {
    if (!isAuthenticated) return;

    // Listen to current state doc
    const stateDocRef = doc(db, "quiz_state", "current");
    const unsubscribeState = onSnapshot(stateDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as QuizState;
        setQuizState(data);
      } else {
        // Build initial document
        const initial: QuizState = {
          currentQuestionIndex: 0,
          status: "idle",
          timerDuration: 60,
          revealWinners: false,
          winners: [],
          correctAnswers: {}
        };
        setDoc(stateDocRef, initial).catch(console.error);
        setQuizState(initial);
      }
    });

    // Listen to guest quiz responses
    const answersCol = collection(db, "quiz_answers");
    const unsubscribeAnswers = onSnapshot(answersCol, (snap) => {
      const list: QuizAnswer[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as QuizAnswer);
      });
      setAnswers(list);
    });

    // Listen to active session documents
    const sessionsCol = collection(db, "quiz_active_sessions");
    const unsubscribeSessions = onSnapshot(sessionsCol, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setActiveSessions(list);
    });

    return () => {
      unsubscribeState();
      unsubscribeAnswers();
      unsubscribeSessions();
    };
  }, [isAuthenticated]);

  // Handle local and Firestore timer ticks
  useEffect(() => {
    if (!quizState || quizState.status !== "running" || !quizState.timerStartedAt) {
      setTimeLeft(null);
      return;
    }

    const interval = setInterval(async () => {
      const startedAt = quizState.timerStartedAt.toDate?.() || new Date(quizState.timerStartedAt);
      const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      const remaining = Math.max(0, quizState.timerDuration - elapsed);
      setTimeLeft(remaining);

      // Auto-end the responses when the countdown reaches zero
      if (remaining === 0) {
        clearInterval(interval);
        try {
          await setDoc(doc(db, "quiz_state", "current"), {
            ...quizState,
            status: "ended",
          }, { merge: true });
        } catch (e) {
          console.error("Error updating expired state:", e);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [quizState]);

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-16 text-center select-none">
        <motion.div 
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 border border-[#E6E8E3] shadow-md max-w-sm w-full flex flex-col items-center"
        >
          <div className="w-14 h-14 bg-[#4A5D4E]/15 rounded-full flex items-center justify-center mb-4 border border-[#4A5D4E]/25">
            <Lock className="w-6 h-6 text-[#4A5D4E]" />
          </div>
          <h2 className="font-serif text-2xl text-[#2F453A] font-light tracking-wide mb-1">
            Painel do Quiz
          </h2>
          <p className="text-[10px] text-[#BF9B30] font-bold tracking-widest uppercase mb-6">
            Controlo Exclusivo do DJ
          </p>

          <form onSubmit={handleLogin} className="w-full space-y-4 font-sans">
            <div className="text-left">
              <label className="block text-[10px] uppercase tracking-wider text-[#7A6B3D] font-bold mb-1.5">
                Palavra-passe do DJ
              </label>
              <input
                type="password"
                placeholder="Insira a password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-4 py-3 bg-[#FAF9F5] border border-[#C5CBC6] rounded-xl text-xs text-[#2F453A] focus:outline-hidden focus:ring-1 focus:ring-[#4A5D4E] focus:border-[#4A5D4E]"
              />
              {authError && (
                <p className="text-[10px] text-red-500 font-medium mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {authError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#4A5D4E] hover:bg-[#3E4F41] text-white rounded-xl font-bold text-xs transition cursor-pointer shadow-xs active:scale-[0.99]"
            >
              Autenticar DJ
            </button>
          </form>

          <p className="text-[10px] text-[#A3B1AA] mt-6 select-none font-sans">
            Casamento Rúben & Catarina 💖
          </p>
        </motion.div>
      </div>
    );
  }

  // Active question index (0 to 29 represent Pergunta 1 to 30)
  const currentQNum = quizState ? quizState.currentQuestionIndex + 1 : 1;
  const currentQId = `q_${currentQNum}`;

  // Get correct answer for the current question
  const currentCorrectAnswer = quizState?.correctAnswers?.[currentQId] || null;

  // Active answers submitted for the current question
  const activeAnswers = answers.filter((ans) => ans.questionId === currentQId);
  const tablesAnswered = activeAnswers.map((ans) => ans.tableNumber);
  const tablesInLack = Array.from({ length: 12 }, (_, i) => i + 1).filter((num) => !tablesAnswered.includes(num));

  // Active/ready tables calculation (tables that clicked "Vamos Jogar!" and heartbeat is active)
  const tablesReadyTimeLimit = Date.now() - 40000; // 40 seconds
  const tablesReadyList = activeSessions
    .filter((sess) => {
      if (!sess.deviceId || !sess.readyToPlay || !sess.id.startsWith("mesa_")) return false;
      const lastActiveAt = sess.lastActiveAt;
      if (!lastActiveAt) return false;
      const dt = lastActiveAt.toDate ? lastActiveAt.toDate() : new Date(lastActiveAt);
      return dt.getTime() > tablesReadyTimeLimit;
    })
    .map((sess) => {
      const numStr = sess.id.replace("mesa_", "");
      return parseInt(numStr, 10);
    })
    .filter((num) => !isNaN(num) && num >= 1 && num <= 12)
    .sort((a, b) => a - b);

  // Switch questions (Pergunta 1 to 30)
  const handleSelectQuestion = async (number: number) => {
    if (!quizState) return;

    const currentQNum = quizState.currentQuestionIndex + 1;
    const currentQId = `q_${currentQNum}`;
    const currentCorrectAnswer = quizState?.correctAnswers?.[currentQId] || null;

    // Check if the DJ is trying to advance/skip to a higher question number than the current one
    if (number > currentQNum && !currentCorrectAnswer) {
      alert(`⚠️ DJ: Não pode avançar! Defina primeiro qual é a opção correta (A, B ou C) para a Pergunta ${currentQNum} antes de avançar.`);
      return;
    }

    try {
      await setDoc(doc(db, "quiz_state", "current"), {
        ...quizState,
        currentQuestionIndex: number - 1,
        status: "idle",
        timerStartedAt: null,
      }, { merge: true });
    } catch (err) {
      console.error("Error changing quiz question:", err);
    }
  };

  // Start question countdown
  const handleStartQuestion = async () => {
    if (!quizState) return;
    try {
      await setDoc(doc(db, "quiz_state", "current"), {
        ...quizState,
        status: "running",
        timerDuration: quizState.timerDuration || 60,
        timerStartedAt: new Date(),
      }, { merge: true });
    } catch (error) {
      console.error("Error starting question:", error);
    }
  };

  // Change active question time limit (e.g. 30s vs 60s vs 120s)
  const handleChangeTimerDuration = async (seconds: number) => {
    if (!quizState) return;
    try {
      await setDoc(doc(db, "quiz_state", "current"), {
        ...quizState,
        timerDuration: seconds
      }, { merge: true });
    } catch (error) {
      console.error("Error changing timer duration:", error);
    }
  };

  // Close responses manually
  const handleCloseResponses = async () => {
    if (!quizState) return;
    try {
      await setDoc(doc(db, "quiz_state", "current"), {
        ...quizState,
        status: "ended",
      }, { merge: true });
    } catch (error) {
      console.error("Error closing responses:", error);
    }
  };

  // Advance to next question (status defaults to idle, awaiting manual start!)
  const handleNextQuestion = async () => {
    if (!quizState) return;

    // Check if correct answer is set for the current question
    const currentQNum = quizState.currentQuestionIndex + 1;
    const currentQId = `q_${currentQNum}`;
    const currentCorrectAnswer = quizState?.correctAnswers?.[currentQId] || null;

    if (!currentCorrectAnswer) {
      alert(`⚠️ DJ: Não pode avançar! Defina primeiro qual é a opção correta (A, B ou C) para a Pergunta ${currentQNum} antes de avançar.`);
      return;
    }

    const nextIdx = quizState.currentQuestionIndex + 1;
    if (nextIdx >= 30) {
      alert("Alcançou a pergunta 30! O quiz terminou. Pode iniciar a cerimónia de resultados ✨");
      return;
    }
    try {
      await setDoc(doc(db, "quiz_state", "current"), {
        ...quizState,
        currentQuestionIndex: nextIdx,
        status: "idle",
        timerStartedAt: null,
      }, { merge: true });
    } catch (error) {
      console.error("Error moving to next question:", error);
    }
  };

  // DJ selects correct answer A, B, or C for the current question
  const handleSetCorrectAnswer = async (option: "A" | "B" | "C") => {
    if (!quizState) return;
    const updatedCorrect = { ...quizState.correctAnswers, [currentQId]: option };
    try {
      await setDoc(doc(db, "quiz_state", "current"), {
        ...quizState,
        correctAnswers: updatedCorrect
      }, { merge: true });
    } catch (error) {
      console.error("Error setting correct answer:", error);
    }
  };

  // Clean entire quiz answers and reset state
  const handleResetQuizAnswers = async () => {
    if (confirm("ATENÇÃO: Deseja apagar todas as respostas e zerar todo o quiz?")) {
      try {
        const batch = writeBatch(db);
        answers.forEach((ans) => {
          batch.delete(doc(db, "quiz_answers", ans.id));
        });
        await batch.commit();

        await setDoc(doc(db, "quiz_state", "current"), {
          currentQuestionIndex: 0,
          status: "idle",
          timerDuration: 60,
          revealWinners: false,
          winners: [],
          correctAnswers: {}
        });
        alert("O quiz foi completamente limpo e redefinido para a Pergunta 1!");
      } catch (err) {
        console.error("Error resetting quiz: ", err);
      }
    }
  };

  // Calculate Cumulative Leaderboard in real-time
  const tableRankings = Array.from({ length: 12 }, (_, i) => {
    const tableNum = i + 1;
    const tableAnswers = answers.filter((ans) => ans.tableNumber === tableNum);

    let correctCount = 0;
    let score = 0;
    let correctAnswersTime = 0;
    let totalAnswersSubmitted = tableAnswers.length;

    tableAnswers.forEach((ans) => {
      const qAnsKey = ans.questionId;
      const rightOp = quizState?.correctAnswers?.[qAnsKey];
      if (rightOp && ans.answer === rightOp) {
        correctCount += 1;
        score += 1; // 1 point per correct answer
        correctAnswersTime += (ans.timeTakenSecs || 0);
      }
    });

    return {
      tableNumber: tableNum,
      correctCount,
      score,
      correctAnswersTime,
      totalAnswersSubmitted,
    };
  });

  // Sort: highest score first. If tied: fast correct speed wins. If still tied: higher submission count wins!
  tableRankings.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.score === 0) {
      // In case both have 0 points, prioritize the one who actually tried and submitted answers!
      return b.totalAnswersSubmitted - a.totalAnswersSubmitted;
    }
    if (a.correctAnswersTime !== b.correctAnswersTime) {
      return a.correctAnswersTime - b.correctAnswersTime;
    }
    return b.totalAnswersSubmitted - a.totalAnswersSubmitted;
  });

  const topThreeTables = tableRankings.slice(0, 3).map((r) => r.tableNumber);

  // Helper to change ceremony step in local and Firestore
  const handleSetCeremonyStep = async (step: 3 | 2 | 1 | "idle") => {
    setResultsCeremonyStep(step);
    if (quizState) {
      try {
        await setDoc(doc(db, "quiz_state", "current"), {
          ...quizState,
          ceremonyStep: step
        }, { merge: true });
      } catch (err) {
        console.error("Error setting ceremony step:", err);
      }
    }
  };

  // Trigger Ceremonies
  const handleOpenCeremony = async () => {
    if (!quizState) return;
    try {
      // Sync top 3 winners to client devices if desired, and toggle winners reveal screen
      await setDoc(doc(db, "quiz_state", "current"), {
        ...quizState,
        revealWinners: true,
        winners: topThreeTables,
        ceremonyStep: 3, // Start with third place in Firestore too!
      }, { merge: true });
      
      setResultsCeremonyStep(3); // Start with third place
    } catch (error) {
      console.error("Error opening results ceremony: ", error);
    }
  };

  const handleCloseCeremony = async () => {
    setResultsCeremonyStep("idle");
    if (quizState) {
      try {
        await setDoc(doc(db, "quiz_state", "current"), {
          ...quizState,
          revealWinners: false,
          ceremonyStep: "idle"
        }, { merge: true });
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Beautiful decorative olive leaves layout icons
  const OliveDecoration = () => (
    <div className="flex justify-center items-center gap-2 text-[#4A5D4E]/30 my-1 select-none pointer-events-none">
      <span className="text-lg">🌿</span>
      <div className="h-[1px] w-12 bg-[#BF9B30]/30"></div>
      <Heart className="w-3.5 h-3.5 text-[#BF9B30]" />
      <div className="h-[1px] w-12 bg-[#BF9B30]/30"></div>
      <span className="text-lg">🌿</span>
    </div>
  );

  return (
    <div className="flex-1 max-w-md mx-auto w-full px-4 py-6 flex flex-col gap-5 select-none pb-24 text-[#2F453A]">
      
      {/* 1. Header Shield */}
      <div className="flex items-center justify-between bg-white border border-[#E6E8E3] rounded-3xl p-4.5 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-150">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="text-left font-sans">
            <h2 className="text-xs font-bold text-[#2F453A] uppercase tracking-wider">DJ Ativo</h2>
            <p className="text-[10px] text-[#788A81]">Quiz sincronizado em tempo real</p>
          </div>
        </div>

        <button 
          onClick={handleLogout}
          className="text-[9px] uppercase tracking-widest font-bold py-1.5 px-3 bg-[#FAF9F5] hover:bg-neutral-100 text-[#788A81] border border-[#E6E8E3] rounded-xl transition cursor-pointer"
        >
          Sair
        </button>
      </div>

      {/* Navegação por Abas (Menu) no Painel do DJ */}
      <div className="flex bg-[#FAF9F5] border border-[#E6E8E3] rounded-2xl p-1 shadow-2xs font-sans">
        <button
          onClick={() => setAdminPage("quiz")}
          className={`flex-1 py-2.5 px-1 rounded-xl text-[10.5px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
            adminPage === "quiz"
              ? "bg-[#4A5D4E] text-white shadow-xs"
              : "text-[#788A81] hover:text-[#2F453A]"
          }`}
        >
          🏆 Quiz
        </button>
        <button
          onClick={() => setAdminPage("moderation")}
          className={`flex-1 py-2.5 px-1 rounded-xl text-[10.5px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
            adminPage === "moderation"
              ? "bg-[#4A5D4E] text-white shadow-xs"
              : "text-[#788A81] hover:text-[#2F453A]"
          }`}
        >
          📸 Moderar ({photos.length + messages.length})
        </button>
        <button
          onClick={() => setAdminPage("memories")}
          className={`flex-1 py-2.5 px-1 rounded-xl text-[10.5px] font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
            adminPage === "memories"
              ? "bg-[#4A5D4E] text-white shadow-xs"
              : "text-[#788A81] hover:text-[#2F453A]"
          }`}
        >
          📚 Memórias
        </button>
      </div>

      {adminPage === "moderation" && (
        <>
          {/* 2. Folha A4 Printable Button Card */}
          <div className="bg-gradient-to-r from-amber-50 to-[#FAF9F5] border border-amber-200 rounded-3xl p-4.5 flex items-center justify-between shadow-xs">
        <div className="text-left">
          <h3 className="font-serif text-[11px] font-bold text-[#7A6B3D] flex items-center gap-1.5 uppercase tracking-wide">
            🖨️ Folha A4 de Códigos QR
          </h3>
          <p className="text-[10px] text-[#4E5C54] leading-relaxed mt-0.5 max-w-[210px]">
            Imprima 12 QR Codes reais (Mesa 1 a 12) para recortar e colar nas mesas da festa.
          </p>
        </div>
        <button
          onClick={() => setShowA4Print(true)}
          className="py-2.5 px-3.5 bg-[#BF9B30] hover:bg-[#A68628] active:scale-95 text-white rounded-xl text-xs font-bold font-sans transition shrink-0 cursor-pointer shadow-xs"
        >
          Ver e Imprimir
        </button>
      </div>

      {/* 2.5. Main Site Portal general QR Code card */}
      <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 shadow-xs flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-amber-50 rounded-full flex items-center justify-center border border-amber-150 shrink-0">
            <QrCode className="w-5 h-5 text-[#BF9B30]" />
          </div>
          <div className="text-left font-sans">
            <h3 className="text-xs font-bold text-[#2F453A] uppercase tracking-wider">Código QR do Portal principal</h3>
            <p className="text-[10px] text-[#788A81]">Acesso geral para fotos, livro de votos, música e quiz</p>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-[#FAF9F5] border border-[#E6E8E3] rounded-2xl p-3">
          {mainQrDataUrl ? (
            <div className="w-20 h-20 bg-white border border-neutral-200 rounded-xl p-1 shrink-0 flex items-center justify-center">
              <img src={mainQrDataUrl} alt="QR Code Portal Geral" className="w-full h-full object-contain" />
            </div>
          ) : (
            <div className="w-20 h-20 bg-zinc-100 rounded-xl shrink-0 animate-pulse" />
          )}
          <div className="flex-1 text-left">
            <span className="text-[9.5px] font-mono text-slate-500 block truncate">{qrBaseUrl}</span>
            <p className="text-[10px] text-[#788A81] leading-tight mt-1">
              Projete este código no ecrã gigante do DJ para os convidados entrarem no portal com a senha 1406!
            </p>
            <div className="flex items-center gap-2 mt-2.5">
              <button
                onClick={() => setShowMainQrModal(true)}
                className="py-1.5 px-3 bg-[#BF9B30] hover:bg-[#A68628] text-white text-[10px] font-bold rounded-lg transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1 shadow-2xs"
              >
                <Monitor className="w-3 h-3" />
                Projetar Código QR 🖥️
              </button>
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {adminPage === "quiz" && (
        <>
          {/* 3. Selective Question Chips (1 to 30 Selector Scroll) */}
          <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 shadow-xs flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-[#F0F2EE] pb-2">
          <span className="text-[9px] uppercase font-bold text-[#7A6B3D] tracking-wider flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            Selecionar Pergunta Ativa
          </span>
          <span className="text-[9px] text-[#788A81] italic">Selecione uma para carregar</span>
        </div>

        <div className="grid grid-cols-6 gap-1.5 overflow-y-auto max-h-36 pr-1 py-1">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((num) => {
            const isSelected = num === currentQNum;
            const hasCorrectAnswer = !!quizState?.correctAnswers?.[`q_${num}`];
            return (
              <button
                key={num}
                onClick={() => handleSelectQuestion(num)}
                className={`py-2 text-center rounded-lg font-bold text-[11px] font-mono border transition-all ${
                  isSelected 
                    ? "bg-[#4A5D4E] border-[#4A5D4E] text-white shadow-xs scale-105" 
                    : hasCorrectAnswer
                    ? "bg-amber-50 text-[#7A6B3D] border-amber-200"
                    : "bg-[#FAF9F5] text-[#2F453A] border-[#E6E8E3] hover:bg-neutral-50"
                }`}
              >
                Q{num}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Live Quiz Controller Hub */}
      {quizState && (
        <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[#F0F2EE] pb-3">
            <div className="text-left">
              <span className="text-[9px] text-[#BF9B30] font-bold uppercase tracking-wider">Sessão Ativa</span>
              <h3 className="font-serif text-base font-normal text-[#2F453A] mt-0.5">
                Pergunta {currentQNum} de 30
              </h3>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full border ${
              quizState.status === "running" 
                ? "bg-emerald-50 text-emerald-600 border-emerald-250 animate-pulse"
                : quizState.status === "ended"
                ? "bg-amber-50 text-amber-600 border-amber-200"
                : "bg-neutral-50 text-[#788A81] border-neutral-200"
            }`}>
              {quizState.status === "idle" ? "Espera" : quizState.status === "running" ? "Ativo" : "Bloqueado"}
            </span>
          </div>

          <div className="bg-[#FAF9F5] border border-[#E6E8E3] rounded-2xl p-4 text-left flex flex-col gap-3.5">
            <div className="text-left">
              <span className="text-[8px] uppercase tracking-wider font-bold text-[#788A81]">Método</span>
              <p className="text-xs text-[#556B2F] font-serif italic mt-0.5">
                Faça a Pergunta {currentQNum} oralmente no microfone.
              </p>
            </div>

            <div className="text-left">
              <span className="text-[8px] uppercase tracking-wider font-bold text-[#788A81]">Tempo de Resposta</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {([30, 60, 90, 120] as const).map((secs) => {
                  const isCurrent = quizState.timerDuration === secs;
                  return (
                    <button
                      key={secs}
                      disabled={quizState.status === "running"}
                      onClick={() => handleChangeTimerDuration(secs)}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition ${
                        isCurrent
                          ? "bg-[#BF9B30] border-[#BF9B30] text-white shadow-xs"
                          : quizState.status === "running"
                          ? "bg-neutral-100 text-neutral-400 border-neutral-150 cursor-not-allowed"
                          : "bg-white border-[#C5CBC6] text-[#788A81] hover:bg-[#FAF9F5] cursor-pointer"
                      }`}
                    >
                      {secs === 60 ? "1 Minuto" : secs === 90 ? "1:30 Min" : secs === 120 ? "2 Minutos" : `${secs}s`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Countdown bar indicator */}
            {quizState.status === "running" && timeLeft !== null && (
              <div className="bg-white border border-[#E6E8E3] p-3 rounded-xl flex items-center justify-between font-mono text-xs">
                <span className="text-[#788A81]">Contagem decrescente ativa:</span>
                <span className={`font-bold ${timeLeft <= 10 ? "text-red-600 animate-pulse" : "text-[#2F453A]"}`}>
                  {timeLeft} segundos restantes
                </span>
              </div>
            )}

            {/* Sincronized Controls Grid */}
            <div className="grid grid-cols-2 gap-2 font-sans">
              <button
                disabled={quizState.status === "running"}
                onClick={handleStartQuestion}
                className={`py-3 px-3.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                  quizState.status === "running"
                    ? "bg-neutral-100 text-neutral-400 border border-neutral-150 cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                }`}
              >
                <Play className="w-3.5 h-3.5 shrink-0" />
                <span>Abrir Respostas ⏱️</span>
              </button>

              <button
                disabled={quizState.status !== "running"}
                onClick={handleCloseResponses}
                className={`py-3 px-3.5 rounded-xl text-xs font-bold transition border justify-center flex items-center gap-1.5 cursor-pointer ${
                  quizState.status !== "running"
                    ? "bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed"
                    : "bg-white text-red-600 border-red-200 hover:bg-red-50"
                }`}
              >
                <Pause className="w-3.5 h-3.5 shrink-0" />
                <span>Bloquear ⏹</span>
              </button>
            </div>
          </div>

          {/* 5. Set Correct Option Selector */}
          <div className="bg-[#FAF9F5]/50 border border-[#E6E8E3] rounded-2xl p-4 flex flex-col gap-3">
            <span className="text-[9px] uppercase font-bold text-[#7A6B3D] tracking-wider text-left">
              Definir Resposta Correta (Cálculo Automático)
            </span>
            <div className="flex items-center justify-between gap-3 bg-white border border-[#E6E8E3] rounded-xl p-2.5">
              <div className="flex gap-1.5">
                {(["A", "B", "C"] as const).map((opt) => {
                  const isCorrect = currentCorrectAnswer === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => handleSetCorrectAnswer(opt)}
                      className={`w-9 h-9 text-xs font-bold rounded-lg border transition ${
                        isCorrect
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-sm scale-105"
                          : "bg-white border-[#C5CBC6] text-[#788A81] hover:bg-[#FAF9F5]"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleNextQuestion}
                className="py-2.5 px-3 bg-[#4A5D4E] hover:bg-[#3E4F41] text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer select-none"
              >
                <span>Passar à Próxima</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Active responses monitor (tables list) */}
      {quizState && (
        <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 shadow-xs flex flex-col gap-4 text-left">
          <h3 className="font-serif text-sm font-semibold text-[#2F453A] flex items-center gap-1.5 pb-2 border-b border-[#F0F2EE]">
            <Users className="w-4 h-4 text-[#BF9B30]" />
            Respostas Recebidas ({activeAnswers.length} de 12)
          </h3>

          <div className="space-y-3.5">
            {/* Real-time indicator for tables that clicked "Vamos Jogar" */}
            <div>
              <p className="text-[9px] uppercase font-bold tracking-wider text-[#BF9B30] mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#BF9B30] animate-pulse"></span>
                <span>Mesas Prontas a Jogar ({tablesReadyList.length} de 12)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tablesReadyList.length === 0 ? (
                  <span className="text-[10px] text-[#A3B1AA] italic">Nenhuma mesa pronta ainda (à espera que cliquem em "Vamos Jogar" nos telemóveis)...</span>
                ) : (
                  tablesReadyList.map((n) => (
                    <span key={n} className="px-2 py-1 bg-amber-50 text-[#7A6B3D] border border-amber-250 text-[9px] font-bold rounded-md flex items-center gap-1">
                      Mesa {n}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-[9px] uppercase font-bold tracking-wider text-[#788A81] mb-1.5">Mesas que já Responderam</p>
              <div className="flex flex-wrap gap-1.5">
                {tablesAnswered.length === 0 ? (
                  <span className="text-[10px] text-[#A3B1AA] italic">A aguardar submissões...</span>
                ) : (
                  tablesAnswered.sort((a,b)=>a-b).map((n) => (
                    <span key={n} className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-100 text-[9px] font-bold rounded-md flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping"></span>
                      Mesa {n}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="text-[9px] uppercase font-bold tracking-wider text-[#A3B1AA] mb-1.5">Mesas em Falta</p>
              <div className="flex flex-wrap gap-1.5">
                {tablesInLack.length === 0 ? (
                  <span className="text-[9px] text-emerald-600 font-bold">✓ Todas responderam!</span>
                ) : (
                  tablesInLack.map((n) => (
                    <span key={n} className="px-2 py-0.5 bg-[#FAF9F5] text-neutral-400 border border-neutral-150 text-[9px] font-medium rounded-md">
                      Mesa {n}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Hidden Leaderboard List for DJ */}
      {quizState && (
        <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 shadow-xs flex flex-col gap-4 text-left">
          <div className="flex items-center justify-between border-b border-[#F0F2EE] pb-2.5">
            <h3 className="font-serif text-sm font-semibold text-[#2F453A] flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-[#BF9B30]" />
              Classificação das Mesas
            </h3>
            <span className="text-[8px] tracking-widest uppercase font-mono bg-amber-50 text-[#BF9B30] border border-amber-100 px-2 py-0.5 rounded font-bold">
              Totalmente Oculto para Convidados
            </span>
          </div>

          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {tableRankings.map((rank, idx) => {
              const opColor = idx === 0 ? "border-amber-200 bg-[#FAF9F5]" : "border-[#E8EAE4] bg-white";
              return (
                <div key={idx} className={`flex justify-between items-center text-xs p-2.5 border rounded-xl ${opColor}`}>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-md bg-[#4A5D4E]/10 flex items-center justify-center font-bold text-[9px] text-[#4A5D4E]">
                      {idx + 1}º
                    </span>
                    <span className="font-bold text-[#2F453A]">Mesa {rank.tableNumber}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className="text-[#788A81]">{rank.correctCount} certas</span>
                    <span className="font-bold text-[#BF9B30] bg-[#FAF9F5] border border-amber-100 px-2 py-0.5 rounded">
                      {rank.score} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Results Ceremony Trigger Button */}
          <button
            onClick={handleOpenCeremony}
            className="w-full py-4 bg-[#BF9B30] hover:bg-[#A68628] text-white text-xs font-bold rounded-2xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer mt-2"
          >
            <Trophy className="w-4 h-4 shrink-0" />
            🎉 Iniciar Cerimónia de Resultados ✨
          </button>
        </div>
      )}
        </>
      )}

      {adminPage === "moderation" && (
        <>
          {/* 10. Memórias do Casamento (ZIP & PDF + Photo Deletion Section) */}
          <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 shadow-xs flex flex-col gap-4 text-left">
        <div className="flex items-center gap-2 border-b border-[#F0F2EE] pb-3">
          <span className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <Award className="w-4 h-4 text-[#BF9B30]" />
          </span>
          <div>
            <h3 className="font-serif text-sm font-semibold text-[#2F453A]">📚 Memórias do Casamento</h3>
            <p className="text-[10px] text-[#788A81]">Controlo de ficheiros, exportação e moderação de fotos</p>
          </div>
        </div>

        {/* Real-time stats badges */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#FAF9F5] border border-[#E6E8E3] rounded-2xl p-3 text-center">
            <span className="block text-lg mb-0.5">📸</span>
            <span className="block text-xs font-bold text-[#2F453A]">{photos.length}</span>
            <span className="block text-[8px] text-[#788A81] uppercase tracking-wider">Fotos</span>
          </div>
          <div className="bg-[#FAF9F5] border border-[#E6E8E3] rounded-2xl p-3 text-center">
            <span className="block text-xs font-bold text-[#2F453A]">{messages.filter(m => !m.hasAudio).length}</span>
            <span className="block text-[8px] text-[#788A81] uppercase tracking-wider">Textos</span>
          </div>
          <div className="bg-[#FAF9F5] border border-[#E6E8E3] rounded-2xl p-3 text-center">
            <span className="block text-lg mb-0.5">🎤</span>
            <span className="block text-xs font-bold text-[#2F453A]">{messages.filter(m => m.hasAudio).length}</span>
            <span className="block text-[8px] text-[#788A81] uppercase tracking-wider">Áudios</span>
          </div>
        </div>

        {/* Action Buttons for downloading package and generating book */}
        <div className="flex flex-col gap-2 mt-1">
          <button
            onClick={handleDownloadZip}
            disabled={isGeneratingZip}
            className="w-full py-3 px-4 bg-[#4A5D4E] hover:bg-[#3E4F41] disabled:bg-[#FAF9F5]/40 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 duration-150"
          >
            {isGeneratingZip ? (
              <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <Download className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>📦 Gerar Arquivo Completo (ZIP)</span>
          </button>

          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPdf}
            className="w-full py-3 px-4 bg-white hover:bg-[#FAF9F5] disabled:bg-[#FAF9F5]/50 border border-[#BF9B30] text-[#7A6B3D] font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 duration-150"
          >
            {isGeneratingPdf ? (
              <span className="animate-spin w-3.5 h-3.5 border-2 border-[#BF9B30] border-t-transparent rounded-full" />
            ) : (
              <Award className="w-3.5 h-3.5 shrink-0 text-[#BF9B30]" />
            )}
            <span>📖 Gerar Álbum Digital (PDF)</span>
          </button>
        </div>

        {/* Moderation Panel */}
        <div className="mt-3 border-t border-[#F0F2EE] pt-4">
          <span className="text-[10px] text-[#7A6B3D] font-bold uppercase tracking-widest block mb-1">
            🗑️ Moderar Conteúdo (Controlo em Direto)
          </span>
          <p className="text-[10px] text-[#788A81] mb-2.5">Apague e faça a gestão das fotos, textos e áudios que os seus convidados enviaram.</p>

          {/* Pill controls */}
          <div className="flex bg-[#FAF9F5] border border-[#E6E8E3] rounded-xl p-1 mb-3">
            <button
              onClick={() => setModerationTab("photos")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition ${
                moderationTab === "photos" 
                  ? "bg-[#4A5D4E] text-white shadow-xs" 
                  : "text-[#788A81] hover:text-[#2F453A]"
              }`}
            >
              Fotos ({photos.length})
            </button>
            <button
              onClick={() => setModerationTab("texts")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition ${
                moderationTab === "texts" 
                  ? "bg-[#4A5D4E] text-white shadow-xs" 
                  : "text-[#788A81] hover:text-[#2F453A]"
              }`}
            >
              Textos ({messages.filter(m => !m.hasAudio).length})
            </button>
            <button
              onClick={() => setModerationTab("voices")}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold transition ${
                moderationTab === "voices" 
                  ? "bg-[#4A5D4E] text-white shadow-xs" 
                  : "text-[#788A81] hover:text-[#2F453A]"
              }`}
            >
              Voz ({messages.filter(m => m.hasAudio).length})
            </button>
          </div>

          {/* Photos moderation list */}
          {moderationTab === "photos" && (
            <div>
              {photos.length === 0 ? (
                <p className="text-[10px] text-[#788A81] italic text-center py-2">Nenhuma fotografia carregada até agora.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2 max-h-[160px] overflow-y-auto pr-1">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative aspect-square ring-1 ring-[#E6E8E3] rounded-lg overflow-hidden group">
                      <picture>
                        <img
                          src={photo.imageUrl}
                          alt="Thumbnail admin"
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </picture>

                      {/* Favorite star tag (always visible if favorited, or visible on hover if not) */}
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const isFav = !!photo.favorite;
                            await setDoc(doc(db, "photos", photo.id), { favorite: !isFav }, { merge: true });
                          } catch (err) {
                            console.error("Error toggling favorite flag on photo: ", err);
                          }
                        }}
                        className={`absolute top-1 left-1 p-1 bg-white/95 backdrop-blur-md rounded-full shadow-2xs transition z-20 cursor-pointer ${
                          photo.favorite ? "text-amber-500 scale-110" : "text-neutral-400 opacity-0 group-hover:opacity-100 hover:text-amber-500 hover:scale-115"
                        }`}
                        title={photo.favorite ? "Remover dos Favoritos" : "Marcar como Favorito"}
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${photo.favorite ? "fill-amber-500 text-amber-500" : ""}`} />
                      </button>

                      <button
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="absolute inset-0 bg-red-600/80 hover:bg-red-700/90 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-150 rounded-lg cursor-pointer animate-fade-in"
                        title="Apagar esta foto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Texts moderation list */}
          {moderationTab === "texts" && (
            <div className="max-h-[180px] overflow-y-auto pr-1 space-y-2 text-left">
              {messages.filter(m => !m.hasAudio).length === 0 ? (
                <p className="text-[10px] text-[#788A81] italic text-center py-2">Nenhum texto enviado até agora.</p>
              ) : (
                messages.filter(m => !m.hasAudio).map((msg) => (
                  <div key={msg.id} className="bg-[#FAF9F5] border border-[#E6E8E3] rounded-xl p-2.5 flex items-start justify-between gap-2 shadow-2xs">
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold text-[#2F453A] block truncate">✍️ {msg.author}</span>
                      <p className="text-xs text-[#4A5D4E] font-light mt-0.5 break-words">"{msg.text}"</p>
                    </div>
                    <button
                      onClick={() => handleDeleteMessage(msg.id)}
                      className="text-red-500 hover:text-red-700 p-1.5 bg-white border border-stone-200 hover:bg-red-50 rounded-lg transition shrink-0"
                      title="Apagar este texto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Voices moderation list */}
          {moderationTab === "voices" && (
            <div className="max-h-[180px] overflow-y-auto pr-1 space-y-2 text-left">
              {messages.filter(m => m.hasAudio).length === 0 ? (
                <p className="text-[10px] text-[#788A81] italic text-center py-2">Nenhuma mensagem de voz até agora.</p>
              ) : (
                messages.filter(m => m.hasAudio).map((msg) => (
                  <div key={msg.id} className="bg-[#FAF9F5] border border-[#E6E8E3] rounded-xl p-2.5 flex flex-col gap-2 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-[#2F453A] truncate flex items-center gap-1">🎤 {msg.author}</span>
                      <button
                        onClick={() => handleDeleteMessage(msg.id)}
                        className="text-red-500 hover:text-red-700 p-1.5 bg-white border border-stone-200 hover:bg-red-50 rounded-lg transition shrink-0"
                        title="Apagar esta gravação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {msg.text && (
                      <p className="text-[10px] text-[#788A81] italic">Texto opcional: "{msg.text}"</p>
                    )}
                    {msg.audioUrl && (
                      <div className="flex items-center gap-2 bg-white border border-stone-150 p-2 rounded-lg">
                        <button
                          type="button"
                          onClick={() => handlePlayVoice(msg.id, msg.audioUrl!)}
                          className="p-2 bg-[#BF9B30] text-white rounded-full hover:bg-[#A68324] transition shrink-0 cursor-pointer"
                        >
                          {playingId === msg.id ? (
                            <Pause className="w-2.5 h-2.5" />
                          ) : (
                            <Play className="w-2.5 h-2.5" />
                          )}
                        </button>
                        <div className="flex-1">
                          <div className="h-1 w-full bg-stone-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#BF9B30] transition-all duration-300" 
                              style={{ width: `${playbackProgress[msg.id] || 0}%` }}
                            ></div>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono text-stone-500">{msg.duration ? `${msg.duration}s` : "Voz"}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {adminPage === "memories" && (
        <MemoryView mode="admin" />
      )}

      {adminPage === "quiz" && (
        <>
          {/* 8. Reset operations */}
          <div className="flex justify-center border-t border-[#F0F2EE] pt-4 px-1">
            <button
              onClick={handleResetQuizAnswers}
              className="text-[9px] uppercase tracking-wider px-3.5 py-2 text-red-500 hover:bg-red-50 border border-red-100 rounded-xl font-bold transition cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Reiniciar Todo o Quiz (Apagar Respostas)
            </button>
          </div>
        </>
      )}

      {/* A4 Print Layout Sheet Area */}
      {showA4Print && (
        <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-xs flex flex-col z-50 overflow-y-auto print:p-0 print:m-0 print:static print:bg-white animate-fade-in">
          {/* Print controls header - hidden during print */}
          <div className="bg-[#4A5D4E] text-white py-4 px-6 flex items-center justify-between sticky top-0 border-b border-white/10 shadow-md print:hidden z-50">
            <div className="text-left font-sans">
              <h2 className="font-serif text-sm font-semibold tracking-wide flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                Folha A4 Pronta a Imprimir
              </h2>
              <p className="text-[10px] text-[#A3B1AA]">Página de tamanho A4 com os 12 códigos QR para recortar.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="py-2.5 px-4 bg-[#BF9B30] hover:bg-[#A68628] active:scale-95 text-white text-xs font-bold font-sans rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Imprimir / PDF 🖨️
              </button>
              <button
                onClick={handleDownloadHTML}
                className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold font-sans rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Descarregar Folha A4 📥
              </button>
              <button
                onClick={() => setShowA4Print(false)}
                className="py-2.5 px-3 bg-white/10 hover:bg-white/20 text-white text-xs font-bold font-sans rounded-xl transition cursor-pointer"
              >
                Sair
              </button>
            </div>
          </div>

          {/* Interactive domain override banner to solve Vercel deploy URLs - hidden during print */}
          <div className="bg-[#3D4F41] text-white/95 py-3 px-6 flex flex-col md:flex-row md:items-center gap-3 print:hidden border-b border-emerald-900/35">
            <div className="text-xs flex items-center gap-2">
              <span className="font-bold text-[#FFEAA7] uppercase tracking-wider text-[10px]">⚙️ Domínio de Produção:</span>
              <input 
                type="text"
                value={qrBaseUrl}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  setQrBaseUrl(val);
                  localStorage.setItem("wedding_quiz_qr_base_url", val);
                }}
                placeholder="https://momentios.me"
                className="bg-zinc-900/40 text-neutral-100 hover:bg-zinc-900/65 font-mono px-3 py-1.5 rounded-xl border border-white/15 text-xs w-64 md:w-80 focus:outline-none focus:border-[#BF9B30] transition"
              />
            </div>
            <p className="text-[10px] text-zinc-300 italic">
              ↳ Introduza o seu domínio final <b className="text-[#FFEAA7]">momentios.me</b> para os códigos QR apontarem sempre para lá, mesmo que esteja no painel de testes!
            </p>
          </div>

          {/* Printable A4 Container */}
          <div className="flex-1 p-6 flex justify-center bg-zinc-800 print:bg-white print:p-0 print:block">
            <div 
              id="printable-a4-sheet" 
              className="bg-white text-[#2F453A] w-[210mm] h-[297mm] p-[10mm] relative shadow-2xl rounded-xs print:shadow-none print:rounded-none print:w-[210mm] print:h-[297mm] print:p-[10mm]"
              style={{
                boxSizing: "border-box",
                fontFamily: "Inter, sans-serif"
              }}
            >
              <style>{`
                @media print {
                  body * {
                    visibility: hidden;
                  }
                  #printable-a4-sheet, #printable-a4-sheet * {
                    visibility: visible;
                  }
                  #printable-a4-sheet {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 210mm;
                    height: 297mm;
                    background: white !important;
                    margin: 0 !important;
                    padding: 10mm !important;
                  }
                }
              `}</style>

              {/* Title Header inside A4 Sheet */}
              <div className="text-center mb-4 border-b border-dashed border-emerald-100 pb-2">
                <span className="font-serif text-sm font-bold uppercase tracking-widest text-[#2F453A]">
                  Casamento de Rúben & Catarina
                </span>
                <p className="text-[9px] text-[#788A81] font-mono mt-0.5">Quiz ao Vivo • Recorte pelas linhas tracejadas e coloque nas mesas.</p>
              </div>

              {/* Grid of 12 places */}
              <div className="grid grid-cols-3 grid-rows-4 gap-[4mm] h-[252mm] w-full">
                {Array.from({ length: 12 }, (_, index) => {
                  const tableNum = index + 1;
                  const qrDataUrl = qrDataUrls[tableNum] || "";

                  return (
                    <div 
                      key={tableNum} 
                      className="border border-dashed border-neutral-300 rounded-2xl p-4 flex flex-col justify-between items-center text-center bg-white relative overflow-hidden"
                      style={{ height: "60mm", boxSizing: "border-box" }}
                    >
                      {/* Frame */}
                      <div className="absolute top-1.5 left-1.5 right-1.5 bottom-1.5 border border-amber-100/50 rounded-xl pointer-events-none"></div>
                      
                      <div className="z-10 flex flex-col items-center">
                        <span className="text-[8px] uppercase font-bold tracking-widest text-[#BF9B30] font-sans">
                          MESA
                        </span>
                        <h4 className="font-serif text-2xl font-bold text-[#2F453A] leading-none mt-0.5">
                          {tableNum}
                        </h4>
                      </div>

                      {/* QR code image */}
                      <div className="w-[28mm] h-[28mm] flex items-center justify-center p-1 bg-white border border-neutral-150 rounded-xl z-10">
                        {qrDataUrl ? (
                          <img 
                            src={qrDataUrl} 
                            alt={`QR Code Mesa ${tableNum}`} 
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full rounded bg-gray-50 flex items-center justify-center text-[10px] text-gray-400">
                            Gerando...
                          </div>
                        )}
                      </div>

                      <div className="z-10 flex flex-col items-center">
                        <p className="text-[7px] font-bold text-[#2F453A] uppercase tracking-wider font-sans leading-tight">
                          Leiam o Código QR para Jogar!
                        </p>
                        <p className="text-[7.5px] text-[#788A81] italic font-serif leading-none mt-1">
                          Rúben & Catarina • 14.06.2026
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 9. Immersive Full-Screen Results Award Ceremony overlay */}
      <AnimatePresence>
        {resultsCeremonyStep !== "idle" && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-neutral-950 flex flex-col justify-between p-6 z-50 text-white select-none"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {/* Elegant luxury framing borders */}
            <div className="absolute inset-4 border border-white/10 rounded-3xl pointer-events-none z-10"></div>
            <div className="absolute inset-5 border border-[#BF9B30]/30 rounded-[22px] pointer-events-none z-10"></div>

            {/* Top branding */}
            <div className="pt-8 text-center z-20">
              <span className="text-xs uppercase tracking-widest leading-none text-[#BF9B30] font-bold">
                Grande Cerimónia de Encerramento
              </span>
              <p className="font-serif text-xl font-light text-white/80 mt-1">
                Casamento de Rúben & Catarina
              </p>
              <div className="mt-2.5">
                <OliveDecoration />
              </div>
            </div>

            {/* Central presentation widget */}
            <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full z-20">
              
              {/* 3rd place display */}
              {resultsCeremonyStep === 3 && (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  key="podium-3"
                  className="flex flex-col items-center text-center gap-4"
                >
                  <div className="w-24 h-24 bg-[#FAF9F5]/5 rounded-full border-2 border-[#E6C6AC] shadow-lg flex items-center justify-center animate-bounce duration-1000">
                    <span className="text-4xl text-[#7F5E46]">🥉</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-widest font-bold text-[#BF9B30] bg-[#BF9B30]/10 px-3 py-1 rounded-full border border-[#BF9B30]/20">
                      Terceiro Lugar
                    </span>
                    <h3 className="font-serif text-4xl font-normal tracking-wide text-white mt-3.5">
                      Mesa {topThreeTables[2] || "Sem Registo"}
                    </h3>
                    <p className="text-xs text-[#788A81] mt-2 leading-relaxed">
                      Uma excelente prestação ao longo do jogo! O DJ convida à forte salva de palmas. 👏
                    </p>
                  </div>
                </motion.div>
              )}

              {/* 2nd place display */}
              {resultsCeremonyStep === 2 && (
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  key="podium-2"
                  className="flex flex-col items-center text-center gap-4"
                >
                  <div className="w-24 h-24 bg-[#FAF9F5]/5 rounded-full border-2 border-slate-300 shadow-lg flex items-center justify-center animate-bounce duration-[1200ms]">
                    <span className="text-4xl text-slate-300">🥈</span>
                  </div>
                  <div>
                    <span className="text-xs uppercase tracking-widest font-bold text-[#BF9B30] bg-[#BF9B30]/10 px-3 py-1 rounded-full border border-[#BF9B30]/20">
                      Segundo Lugar
                    </span>
                    <h3 className="font-serif text-4xl font-normal tracking-wide text-white mt-3.5">
                      Mesa {topThreeTables[1] || "Sem Registo"}
                    </h3>
                    <p className="text-xs text-[#788A81] mt-2 leading-relaxed">
                      Quase lá! Respostas rápidas e conhecimento certeiro. Magnífica pontuação! 🥈✨
                    </p>
                  </div>
                </motion.div>
              )}

              {/* 1st place display (Special Confetti premium animation layout) */}
              {resultsCeremonyStep === 1 && (
                <motion.div 
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  key="podium-1"
                  className="flex flex-col items-center text-center gap-5 relative w-full"
                >
                  {/* Real-time generated CSS Confetti shower absolute frames */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden h-[300px]">
                    {Array.from({ length: 40 }).map((_, i) => {
                      const randLeft = Math.random() * 100;
                      const randDelay = Math.random() * 4;
                      const randDuration = 2 + Math.random() * 3;
                      const randColor = ["#BF9B30", "#FFEAA7", "#556B2F", "#A3B1AA"][i % 4];
                      return (
                        <div
                          key={i}
                          className="absolute w-2 h-2 rounded-full opacity-70 animate-fall"
                          style={{
                            left: `${randLeft}%`,
                            top: `-10px`,
                            backgroundColor: randColor,
                            animationDelay: `${randDelay}s`,
                            animationDuration: `${randDuration}s`,
                          }}
                        />
                      );
                    })}
                  </div>

                  <style>{`
                    @keyframes fall {
                      0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                      100% { transform: translateY(280px) rotate(360deg); opacity: 0; }
                    }
                    .animate-fall {
                      animation: fall linear infinite;
                    }
                  `}</style>

                  <div className="w-28 h-28 bg-[#BF9B30]/15 rounded-full border-2 border-[#BF9B30] shadow-2xl flex items-center justify-center z-10 relative">
                    {/* Bounding branch circle animation */}
                    <div className="absolute inset-0 rounded-full border border-[#BF9B30] animate-ping opacity-25"></div>
                    <span className="text-5xl animate-pulse">🏆</span>
                  </div>

                  <div className="z-10">
                    <span className="text-xs uppercase tracking-widest font-extrabold text-[#BF9B30] bg-[#BF9B30]/25 px-4 py-1.5 rounded-full border border-[#BF9B30]/40 animate-pulse">
                      🥇 GRANDE VENCEDOR 🥇
                    </span>
                    <h3 className="font-serif text-5xl font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 mt-4">
                      Mesa {topThreeTables[0] || "Sem Registo"}
                    </h3>
                    <p className="text-xs text-amber-100/80 mt-3 leading-relaxed max-w-[280px] mx-auto">
                      Os maiores campeões e sábios da festa! Celebrem em grande estilo! 🌿🍾
                    </p>
                  </div>
                </motion.div>
              )}

            </div>

            {/* Bottom transition actions */}
            <div className="pb-8 text-center flex flex-col items-center gap-3.5 z-20">
              {resultsCeremonyStep === 3 && (
                <button
                  onClick={() => handleSetCeremonyStep(2)}
                  className="py-3 px-8 bg-[#BF9B30] hover:bg-[#A68628] rounded-xl text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1 active:scale-[0.98]"
                >
                  Revelar 2º Lugar
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {resultsCeremonyStep === 2 && (
                <button
                  onClick={() => handleSetCeremonyStep(1)}
                  className="py-3 px-8 bg-[#BF9B30] hover:bg-[#A68628] rounded-xl text-xs font-bold transition shadow-md cursor-pointer flex items-center gap-1 active:scale-[0.98]"
                >
                  Revelar 1º Lugar 🏆
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {resultsCeremonyStep === 1 && (
                <button
                  onClick={handleCloseCeremony}
                  className="py-3 px-8 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1"
                >
                  Fechar Cerimónia de Encerramento
                </button>
              )}

              <p className="text-[10px] text-white/40 uppercase tracking-widest leading-none font-sans mt-1">
                Comentários e Análises em Direto
              </p>
            </div>
          </motion.div>
        )}

        {/* Fullscreen Projection Modal Overlay for General QR Code Access and Password instruction */}
        {showMainQrModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-stone-950 text-white flex flex-col z-50 p-6 md:p-12 select-none overflow-y-auto"
          >
            {/* Absolute close button */}
            <button 
              onClick={() => setShowMainQrModal(false)}
              className="absolute top-6 right-6 py-2 px-4 bg-white/10 hover:bg-white/20 hover:text-white rounded-xl text-xs font-semibold tracking-widest uppercase transition duration-150 cursor-pointer border border-white/10"
            >
              ✕ Fechar Projeção
            </button>

            {/* Content centerpiece */}
            <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto w-full text-center py-6">
              
              {/* Top Banner and Brand */}
              <div className="mb-6 flex flex-col items-center">
                <span className="text-3xl animate-bounce mb-2">🌿</span>
                <p className="text-xs text-[#BF9B30] font-sans font-bold tracking-[0.3em] uppercase">
                  Acedam ao Nosso Portal do Casamento
                </p>
                <h1 className="font-serif text-5xl md:text-6xl font-light text-slate-100 mt-2 tracking-wide">
                  Rúben & Catarina
                </h1>
                <p className="text-sm font-mono font-medium text-slate-400 tracking-widest mt-1.5 uppercase">
                  14 de Junho de 2026
                </p>
                <div className="w-24 h-[1px] bg-amber-500/30 mt-4"></div>
              </div>

              {/* Main QR Code Display Area */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-10 bg-stone-900/40 border border-white/5 rounded-[40px] px-8 py-10 md:px-12 md:py-12 shadow-2xl relative overflow-hidden my-4 max-w-3xl w-full">
                {/* Visual subtle lighting backdrops */}
                <div className="absolute inset-0 pointer-events-none opacity-20 bg-radiating from-amber-500/20 via-transparent to-transparent"></div>
                
                {/* Big Matrix image */}
                <div className="w-64 h-64 bg-white border-4 border-[#BF9B30] rounded-3xl p-3 shadow-[0_0_30px_rgba(191,155,48,0.25)] flex items-center justify-center shrink-0 z-10 animate-fade-in animate-pulse">
                  {mainQrDataUrl ? (
                    <img 
                      src={mainQrDataUrl} 
                      alt="Código QR Principal de Acesso" 
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full bg-slate-100 rounded-xl animate-pulse" />
                  )}
                </div>

                {/* Instructions pane */}
                <div className="flex-1 text-left flex flex-col justify-center z-10">
                  <span className="text-[10px] font-mono uppercase bg-[#BF9B30]/20 text-[#FFEAA7] px-3 py-1 rounded-full border border-[#BF9B30]/30 w-fit">
                    Passo a Passo Fácil
                  </span>
                  
                  <div className="space-y-4 mt-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-emerald-600/35 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-205">Aponte a Câmara</h4>
                        <p className="text-xs text-slate-400 leading-snug mt-0.5">Abra a câmara fotográfica ou leitor QR do telemóvel e aponte para o ecrã.</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 bg-amber-400/10 border border-amber-400/20 p-3.5 rounded-2xl">
                      <span className="w-6 h-6 rounded-full bg-amber-600/35 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 animate-pulse">2</span>
                      <div>
                        <h4 className="text-sm font-bold text-[#FFEAA7]">Senha de Acesso Requerida</h4>
                        <p className="text-xs text-amber-100/90 leading-snug mt-0.5">
                          Para aceder, introduza a senha obrigatória: <b className="text-white font-mono bg-stone-950 px-2 py-0.5 rounded text-sm text-center border border-amber-500/45 animate-pulse ml-1">1406</b>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600/35 text-blue-400 border border-blue-500/30 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-205">Partilhem a Festa!</h4>
                        <p className="text-xs text-slate-400 leading-snug mt-0.5">Coloque o seu nome, envie fotos em direto para o painel, faça pedidos de música e divirta-se com o quiz!</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Interactivity badges */}
              <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-4 text-xs font-semibold text-slate-400">
                <span className="flex items-center gap-1.5">📸 Envie as suas Fotos</span>
                <span className="text-stone-700">•</span>
                <span className="flex items-center gap-1.5">🎵 Peça Músicas ao DJ</span>
                <span className="text-stone-700">•</span>
                <span className="flex items-center gap-1.5">✍️ Mensagem no Livro de Votos</span>
                <span className="text-stone-700">•</span>
                <span className="flex items-center gap-1.5">🏆 Dispute o Quiz de Mesa</span>
              </div>
            </div>

            {/* Bottom sponsor tag */}
            <div className="text-center mt-auto border-t border-white/5 pt-4 text-[10px] text-stone-500 tracking-wider">
              ANIMAÇÃO & DJ OFICIAL: <b className="text-[#BF9B30]">A. VEIGA CASAMENTOS MÁGICOS</b> • WWW.CASAMENTOSMAGICOS.COM
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
