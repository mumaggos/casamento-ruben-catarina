/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Mic, Square, Play, Pause, Send, Trash2, MicOff, MessageSquare, Loader2, Sparkles, Edit2 } from "lucide-react";
import { collection, onSnapshot, query, orderBy, setDoc, doc, deleteDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Message } from "../types";

interface GuestbookViewProps {
  guestName: string;
  setGuestName: (name: string) => void;
  anonId: string;
  userId: string | null;
  onShowNameModal: () => void;
}

export default function GuestbookView({ guestName, setGuestName, anonId, userId, onShowNameModal }: GuestbookViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [textMessage, setTextMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msgToDelete, setMsgToDelete] = useState<string | null>(null);

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [microphoneAllowed, setMicrophoneAllowed] = useState<boolean | null>(null);

  // Audio player states
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<{ [id: string]: number }>({});

  const recordingIntervalRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const activeId = userId || anonId;

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Message[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(list);
    }, (error) => {
      console.error("Error loading guestbook snapshot:", error);
    });

    return () => {
      unsubscribe();
      if (activeAudio) {
        activeAudio.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          if (prev >= 29) {
            handleStopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }

    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [isRecording]);

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

  const handleStartRecording = async () => {
    if (!guestName.trim()) {
      onShowNameModal();
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("O seu navegador não suporta gravação de áudio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicrophoneAllowed(true);
      audioChunksRef.current = [];

      const options = { mimeType: "audio/webm" };
      let recorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch (err) {
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(audioBlob);

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          setAudioUrl(base64data);
        };

        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setRecordingDuration(0);
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied:", err);
      setMicrophoneAllowed(false);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    setIsRecording(false);
  };

  const deleteCurrentRecording = () => {
    setAudioUrl(null);
    setAudioBlob(null);
    setRecordingDuration(0);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!guestName.trim()) {
      onShowNameModal();
      return;
    }

    if (!textMessage.trim() && !audioUrl) {
      alert("Escreva uma mensagem ou grave um áudio para poder enviar!");
      return;
    }

    const authorName = guestName.trim() || "Convidado Especial";

    setSubmitting(true);
    const id = "msg_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();

    const newMessage: Message = {
      id,
      author: authorName,
      text: textMessage.trim(),
      hasAudio: !!audioUrl,
      createdAt: new Date(),
      authorId: activeId
    };

    if (audioUrl) {
      newMessage.audioUrl = audioUrl;
      newMessage.duration = recordingDuration;
    }

    try {
      await setDoc(doc(db, "messages", id), {
        ...newMessage,
        createdAt: new Date()
      });
      
      setTextMessage("");
      setAudioUrl(null);
      setAudioBlob(null);
      setRecordingDuration(0);
    } catch (err) {
      console.error("Error creating guestbook message:", err);
      handleFirestoreError(err, OperationType.CREATE, `messages/${id}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!msgToDelete) return;
    const currentId = msgToDelete;
    setMsgToDelete(null);
    try {
      await deleteDoc(doc(db, "messages", currentId));
    } catch (err) {
      console.error("Error removing message:", err);
      handleFirestoreError(err, OperationType.DELETE, `messages/${currentId}`);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4 text-center">
      <div className="text-center mb-5">
        <h2 className="font-serif text-2xl text-[#2F453A] font-light">
          Livro de Honra Digital
        </h2>
        <p className="text-xs text-[#788A81] mt-0.5">
          Deixe as suas palavras carinhosas e votos de felicidade
        </p>
      </div>

      {/* Write & Record Panel */}
      <form onSubmit={handleSendMessage} className="bg-[#F4F6F2] border border-[#E6E8E3] rounded-2xl p-4 text-left mb-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[#556B2F] uppercase tracking-wider">
            Escrever Mensagem
          </span>
          <button 
            type="button"
            onClick={onShowNameModal}
            className="text-[11px] text-[#BF9B30] hover:underline flex items-center gap-1 font-bold"
          >
            <Edit2 className="w-2.5 h-2.5" />
            <span>Identificado como: {guestName || "Entrar"}</span>
          </button>
        </div>

        <textarea
          value={textMessage}
          onChange={(e) => setTextMessage(e.target.value)}
          placeholder="Deixe os seus votos ao casal Rúben e Catarina... ❤️"
          rows={3}
          className="w-full bg-white p-3.5 border border-[#C5CBC6] rounded-xl text-sm focus:outline-hidden focus:ring-1 focus:ring-[#4A5D4E] text-[#2F453A] resize-none"
        />

        {/* Voice message container */}
        <div className="bg-white border border-[#E6E8E3] rounded-xl p-3.5 flex flex-col gap-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#2F453A] flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5 text-[#BF9B30]" />
              Adicionar Áudio (Mensagem de Voz)
            </span>
            {audioUrl && (
              <button
                type="button"
                onClick={deleteCurrentRecording}
                className="text-xs text-red-500 hover:underline flex items-center gap-0.5 font-semibold"
              >
                Remover áudio
              </button>
            )}
          </div>

          {/* Recorder state wrappers */}
          {!audioUrl ? (
            <div className="flex items-center justify-center py-2">
              {isRecording ? (
                <button
                  type="button"
                  onClick={handleStopRecording}
                  className="flex items-center gap-2 py-2 px-5 bg-red-50 border border-red-200 text-red-700 rounded-full font-semibold animate-pulse text-xs transition active:scale-95"
                >
                  <Square className="w-4 h-4 fill-red-600 text-red-600" />
                  <span>A gravar... {recordingDuration}s / 30s</span>
                </button>
              ) : (
                <div className="flex flex-col items-center gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    className="flex items-center gap-2 py-2.5 px-6 bg-[#FAF9F5] border border-[#BF9B30]/30 hover:border-[#BF9B30] text-[#7A6B3D] rounded-full text-xs font-semibold transition active:scale-95"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Gravar Mensagem de Voz</span>
                  </button>
                  {microphoneAllowed === false && (
                    <span className="text-[10px] text-red-650 flex items-center gap-1 text-center font-medium leading-relaxed mt-1">
                      <MicOff className="w-3 h-3 text-[#BF9B30]" />
                      Autorize o acesso ao microfone nas definições para gravar áudio.
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-[#F4F6F2] py-2 px-3 rounded-lg border border-[#E6E8E3]">
              <button
                type="button"
                onClick={() => handlePlayVoice("preview", audioUrl)}
                className="p-2 bg-[#4A5D4E] text-white rounded-full hover:bg-[#3E4F41] active:scale-95 transition shrink-0 transform"
              >
                {playingId === "preview" ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-white" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-[10px] text-[#788A81] mb-1 font-semibold">
                  <span>Áudio Gravado</span>
                  <span>{recordingDuration}s</span>
                </div>
                <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#BF9B30]" 
                    style={{ width: `${playbackProgress["preview"] || 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3.5 px-6 bg-[#4A5D4E] hover:bg-[#3E4F41] text-white rounded-xl font-medium text-sm transition shadow-xs flex items-center justify-center gap-2 active:scale-98"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>A enviar...</span>
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              <span>Enviar Mensagem</span>
            </>
          )}
        </button>
      </form>

      {/* Messages Feed */}
      <div className="space-y-4 text-left" id="blog-guestbook">
        {messages.length === 0 ? (
          <div className="bg-white border border-[#E6E8E3] rounded-3xl p-10 text-center text-[#788A81] shadow-xs">
            <MessageSquare className="w-10 h-10 mx-auto text-[#C5CBC6] mb-2" />
            <p className="text-sm font-medium">As vossas palavras no Livro de Honra aparecerão aqui.</p>
            <p className="text-[11px] mt-1 text-[#C5CBC6]">Escreva votos ou grave uma bonita mensagem de voz!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwner = msg.authorId === anonId || (userId && msg.authorId === userId);
            
            return (
              <div 
                key={msg.id} 
                className="bg-[#FCFBF9] border border-stone-200/80 border-l-4 border-l-[#BF9B30] rounded-2xl p-4.5 shadow-xs relative flex flex-col gap-3 group transition duration-300 hover:shadow-md hover:bg-white animate-focus"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-serif text-[15px] font-bold text-[#2F453A] flex items-center gap-1.5">
                      <span className="text-stone-400 select-none">🌿</span>
                      <span className="truncate">{msg.author}</span>
                    </h4>
                    <p className="text-[10px] text-[#788A81] ml-5">
                      {msg.createdAt?.toDate ? (
                        new Intl.DateTimeFormat("pt-PT", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short"
                        }).format(msg.createdAt.toDate())
                      ) : (
                        "Agora mesmo"
                      )}
                    </p>
                  </div>

                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => setMsgToDelete(msg.id)}
                      className="text-[#788A81] hover:text-red-650 p-1.5 hover:bg-red-50 rounded-full transition shrink-0"
                      title="Apagar mensagem"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {msg.text && (
                  <p className="text-sm text-[#4A5D4E] font-sans font-light leading-relaxed break-words whitespace-pre-line bg-[#FAF9F5]/60 p-3 rounded-xl border border-stone-100 italic">
                    "{msg.text}"
                  </p>
                )}

                {msg.hasAudio && msg.audioUrl && (
                  <div className="bg-[#FAF9F5] border border-[#BF9B30]/20 rounded-xl p-3 flex items-center gap-3 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handlePlayVoice(msg.id, msg.audioUrl!)}
                      className="p-3 bg-[#BF9B30] text-white rounded-full hover:bg-[#A68324] transition duration-150 flex items-center justify-center active:scale-95 shrink-0 shadow-xs"
                    >
                      {playingId === msg.id ? (
                        <Pause className="w-3.5 h-3.5" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-white text-white" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-[11px] text-[#A68324] font-medium mb-1.5">
                        <span className="flex items-center gap-1.5 font-bold">
                          <Mic className="w-3.5 h-3.5 text-[#BF9B30] animate-pulse" />
                          Mensagem de voz
                        </span>
                        <span className="font-mono text-[10px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-150">{msg.duration ? `${msg.duration}s` : "Áudio"}</span>
                      </div>
                      <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden border border-stone-200/50">
                        <div 
                          className="h-full bg-gradient-to-r from-[#BF9B30] to-[#E6B040]" 
                          style={{ width: `${playbackProgress[msg.id] || 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Customized Elegant Deletion Modal */}
      {msgToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-[#E6E8E3] shadow-lg text-center flex flex-col gap-4 text-left">
            <h3 className="font-serif text-base text-[#2F453A] font-semibold text-center">
              Apagar Mensagem?
            </h3>
            <p className="text-xs text-[#788A81] leading-relaxed text-center">
              Tem a certeza de que deseja eliminar os seus votos do Livro de Honra? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMsgToDelete(null)}
                className="flex-1 py-2.5 border border-[#C5CBC6] hover:bg-[#FAF9F5] text-[#2F453A] text-xs font-semibold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
              >
                Apagar Mensagem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
