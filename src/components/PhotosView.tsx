/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Camera, Image as ImageIcon, Heart, Loader2, Sparkles, Trash2, Edit2, X, ChevronLeft, ChevronRight } from "lucide-react";
import { collection, onSnapshot, query, orderBy, setDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove, increment } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { Photo } from "../types";

interface PhotosViewProps {
  guestName: string;
  setGuestName: (name: string) => void;
  anonId: string;
  userId: string | null;
  onShowNameModal: () => void;
}

export default function PhotosView({ guestName, setGuestName, anonId, userId, onShowNameModal }: PhotosViewProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("todas");
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<"cerimonia" | "festa" | "amigos" | "momentos">("festa");
  const [photoToDelete, setPhotoToDelete] = useState<Photo | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const activeId = userId || anonId;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Keydown / keyboard listener for desktop lightbox controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === "ArrowLeft" || e.key === "Left") {
        handlePrevPhoto();
      } else if (e.key === "ArrowRight" || e.key === "Right") {
        handleNextPhoto();
      } else if (e.key === "Escape") {
        setLightboxIndex(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxIndex, photos]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    
    // Swipe left (next photo)
    if (diff > 45) {
      handleNextPhoto();
    }
    // Swipe right (prev photo)
    if (diff < -45) {
      handlePrevPhoto();
    }
    
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const handleNextPhoto = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      return (prev + 1) % filteredPhotos.length;
    });
  };

  const handlePrevPhoto = () => {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      return (prev - 1 + filteredPhotos.length) % filteredPhotos.length;
    });
  };

  useEffect(() => {
    const q = query(collection(db, "photos"), orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: Photo[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Photo);
        });
        setPhotos(list);
      },
      (error) => {
        console.error("Error fetching photos in snapshot:", error);
      }
    );

    return () => unsubscribe();
  }, []);

  const compressAndUploadImage = (file: File, category: "cerimonia" | "festa" | "amigos" | "momentos") => {
    const author = guestName.trim() || "Convidado Especial";
    setUploading(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = async () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const base64Url = canvas.toDataURL("image/jpeg", 0.65);
        const photoId = "photo_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
        
        const newPhoto: Photo = {
          id: photoId,
          author: author,
          category: category,
          imageUrl: base64Url,
          likesCount: 0,
          likedBy: [],
          createdAt: new Date(),
          authorId: activeId
        };

        try {
          await setDoc(doc(db, "photos", photoId), {
            ...newPhoto,
            createdAt: new Date()
          });
        } catch (err) {
          console.error("Error creating photo doc:", err);
          handleFirestoreError(err, OperationType.CREATE, `photos/${photoId}`);
        } finally {
          setUploading(false);
        }
      };
    };
  };

  const handleCaptureFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    compressAndUploadImage(file, uploadCategory);
  };

  const triggerUploadWithCategory = (category: "cerimonia" | "festa" | "amigos" | "momentos", isCamera: boolean) => {
    setUploadCategory(category);
    if (!guestName.trim()) {
      onShowNameModal();
      return;
    }
    if (isCamera) {
      cameraInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const toggleLike = async (photo: Photo) => {
    if (!guestName.trim()) {
      onShowNameModal();
      return;
    }

    const isAlreadyLiked = photo.likedBy?.includes(activeId);
    const photoRef = doc(db, "photos", photo.id);

    try {
      if (isAlreadyLiked) {
        await updateDoc(photoRef, {
          likedBy: arrayRemove(activeId),
          likesCount: increment(-1)
        });
      } else {
        await updateDoc(photoRef, {
          likedBy: arrayUnion(activeId),
          likesCount: increment(1)
        });
      }
    } catch (err) {
      console.error("Error toggling like:", err);
      handleFirestoreError(err, OperationType.UPDATE, `photos/${photo.id}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!photoToDelete) return;
    const photoId = photoToDelete.id;
    setPhotoToDelete(null);
    try {
      await deleteDoc(doc(db, "photos", photoId));
    } catch (err) {
      console.error("Error removing photo:", err);
      handleFirestoreError(err, OperationType.DELETE, `photos/${photoId}`);
    }
  };

  const categories = [
    { value: "todas", label: "✨ Todas" },
    { value: "cerimonia", label: "⛪ Cerimónia" },
    { value: "festa", label: "🥳 Festa" },
    { value: "amigos", label: "🍾 Amigos" },
    { value: "momentos", label: "🌿 Momentos" }
  ];

  const filteredPhotos = selectedCategory === "todas"
    ? photos
    : photos.filter(p => p.category === selectedCategory);

  return (
    <div className="w-full max-w-md mx-auto px-4 py-4">
      {/* Hidden Files Selectors */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleCaptureFile}
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        onChange={handleCaptureFile}
        className="hidden"
      />

      {/* Hero Header Album */}
      <div className="text-center mb-5">
        <h2 className="font-serif text-2xl text-[#2F453A] font-light">
          Álbum Vivo
        </h2>
        <p className="text-xs text-[#788A81] mt-0.5">
          Partilhe e explore fotos tiradas neste grande dia
        </p>
      </div>

      {/* Guest Photographer Invitation Highlight Card */}
      <div className="bg-white border border-[#E6E8E3] rounded-3xl p-5 mb-5 text-left relative overflow-hidden shadow-2xs">
        <div className="absolute top-0 right-0 w-16 h-16 bg-[#F4F6F2] rounded-full -mr-8 -mt-8" />
        <p className="font-sans text-xs text-[#2F453A] leading-relaxed relative z-10 font-medium select-none">
          "Querido convidado,<br />
          Hoje não és apenas testemunha desta história — também fazes parte dela.<br />
          Partilha as tuas fotografias e ajuda-nos a preservar os sorrisos, os abraços e os pequenos momentos que tornarão este dia inesquecível. 🤍💍"
        </p>
      </div>

      {/* Upload Panel */}
      <div className="bg-[#F4F6F2] border border-[#E6E8E3] rounded-2xl p-4 mb-6 text-left">
        <div className="flex items-center justify-between mb-3 border-b border-[#E6E8E3]/50 pb-2">
          <span className="text-xs font-semibold text-[#556B2F] uppercase tracking-wider flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 text-[#BF9B30]" />
            Adicionar ao Álbum
          </span>
          <button 
            type="button"
            onClick={onShowNameModal}
            className="text-[10px] text-[#BF9B30] hover:underline flex items-center gap-1 font-bold"
          >
            <Edit2 className="w-2.5 h-2.5" />
            <span>Autor: {guestName || "Identificar-se"}</span>
          </button>
        </div>

        <div className="space-y-3">
          {/* Category selection selector for upload */}
          <div className="flex items-center justify-between text-xs bg-white rounded-xl p-2.5 border border-[#E6E8E3]">
            <span className="text-[#788A81]">Categoria da Foto:</span>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as any)}
              className="bg-transparent font-semibold text-[#2F453A] focus:outline-hidden cursor-pointer selection:bg-[#FAF9F5]"
            >
              <option value="cerimonia">⛪ Cerimónia</option>
              <option value="festa">🥳 Festa</option>
              <option value="amigos">🍾 Amigos</option>
              <option value="momentos">🌿 Momentos</option>
            </select>
          </div>

          {uploading ? (
            <div className="w-full flex items-center justify-center py-4 bg-white rounded-xl border border-[#E6E8E3] gap-2 text-[#4A5D4E] text-sm font-semibold">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>A enviar e comprimir...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => triggerUploadWithCategory(uploadCategory, true)}
                className="flex flex-col items-center justify-center p-3.5 bg-[#4A5D4E] hover:bg-[#3E4F41] active:bg-[#2C382E] text-white rounded-xl gap-1.5 transition shadow-xs active:scale-95"
              >
                <Camera className="w-5 h-5" />
                <span className="text-[11px] font-semibold">Tirar Foto</span>
              </button>

              <button
                type="button"
                onClick={() => triggerUploadWithCategory(uploadCategory, false)}
                className="flex flex-col items-center justify-center p-3.5 bg-white border border-[#C5CBC6] hover:bg-[#FAF9F5] active:bg-neutral-100 rounded-xl gap-1.5 text-[#2F453A] transition active:scale-95"
              >
                <ImageIcon className="w-5 h-5 text-[#BF9B30]" />
                <span className="text-[11px] font-semibold">Selecione Galeria</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter Options */}
      <div className="flex items-center justify-between text-xs bg-[#FAF9F5] rounded-xl p-3 border border-stone-200/80 mb-4 shadow-2xs">
        <span className="text-[#2F453A] font-medium flex items-center gap-1.5 shrink-0 uppercase tracking-widest font-sans text-[10px]">
          🎨 Filtrar Categoria:
        </span>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-white border border-[#E6E8E3] font-serif font-semibold text-xs text-[#2F453A] py-1.5 px-3 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#BF9B30] cursor-pointer"
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label === "✨ Todas" ? "✨ Todas as Fotos" : c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Grid photos layout */}
      {filteredPhotos.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E6E8E3] p-12 text-center text-[#788A81] shadow-xs">
          <ImageIcon className="w-10 h-10 mx-auto text-[#C5CBC6] mb-3" />
          <p className="text-sm font-medium">Nenhuma foto enviada ainda nesta categoria.</p>
          <p className="text-[11px] mt-1 text-[#C5CBC6]">Seja o primeiro a carregar um momento bonito!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3" id="photo-grid-list">
          {filteredPhotos.map((photo) => {
            const isLiked = photo.likedBy?.includes(activeId);
            const canDelete = photo.authorId === anonId || (userId && photo.authorId === userId);

            return (
              <div 
                key={photo.id} 
                className="bg-white rounded-2xl border border-[#E6E8E3] overflow-hidden shadow-xs flex flex-col group relative"
              >
                {/* Photo frame */}
                <div 
                  className="aspect-square w-full overflow-hidden bg-neutral-100 relative cursor-pointer"
                  onClick={() => setLightboxIndex(filteredPhotos.findIndex(p => p.id === photo.id))}
                >
                  <picture>
                    <img 
                      src={photo.imageUrl} 
                      alt={`Foto por ${photo.author}`} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </picture>
                  
                  {/* Category tag bubble */}
                  <span className="absolute bottom-2 left-2 bg-black/50 backdrop-blur-md text-[9px] text-white font-medium capitalize px-2 py-0.5 rounded-full">
                    {photo.category}
                  </span>

                  {/* Delete button if owner */}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setPhotoToDelete(photo)}
                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-full transition shadow-md"
                      title="Apagar foto"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Engagement / description bar */}
                <div className="p-3 flex items-center justify-between bg-white border-t border-[#F0F2EE]">
                  <div className="truncate pr-1.5 text-left min-w-0">
                    <p className="text-xs font-semibold text-[#2F453A] truncate">
                      {photo.author}
                    </p>
                    <p className="text-[9px] text-[#788A81] uppercase tracking-wide">
                      {photo.category}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleLike(photo)}
                    className="flex items-center gap-1 text-xs text-[#556B2F] font-bold py-1 px-2 rounded-xl bg-[#F4F6F2] border border-[#E6E8E3] hover:border-[#BF9B30]/30 transition group/btn shrink-0"
                  >
                    <Heart 
                      className={`w-3.5 h-3.5 transition-all ${
                        isLiked 
                          ? "text-red-500 fill-red-500 scale-110" 
                          : "text-[#788A81] group-hover/btn:scale-110"
                      }`} 
                    />
                    <span>{photo.likesCount || 0}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Elegant Fullscreen Lightbox Modal */}
      {lightboxIndex !== null && filteredPhotos[lightboxIndex] && (() => {
        const photo = filteredPhotos[lightboxIndex];
        const isLiked = photo.likedBy?.includes(activeId);
        
        return (
          <div 
            className="fixed inset-0 bg-stone-950/98 backdrop-blur-md flex flex-col justify-between p-4 z-50 animate-fade-in select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Header with Close and Index Indicator */}
            <div className="flex items-center justify-between text-white w-full max-w-sm mx-auto pt-6">
              <span className="text-xs font-mono opacity-80">
                {lightboxIndex + 1} de {filteredPhotos.length}
              </span>
              <button 
                type="button" 
                onClick={() => setLightboxIndex(null)}
                className="p-2.5 bg-white/10 hover:bg-white/25 active:scale-95 text-white rounded-full transition duration-150 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Picture Center Area with Chevrons and swipe label */}
            <div className="relative flex-1 flex items-center justify-center max-w-sm w-full mx-auto my-4">
              {/* Previous Arrow Button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePrevPhoto(); }}
                className="absolute left-2 z-20 p-2.5 bg-black/45 hover:bg-black/60 rounded-full text-white transition cursor-pointer md:block hidden active:scale-90"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {/* Photo Image Frame with low opacity fade loader */}
              <div className="w-full max-h-[60vh] flex items-center justify-center overflow-hidden relative rounded-xl">
                <img 
                  src={photo.imageUrl} 
                  alt={`Expandida por ${photo.author}`} 
                  className="max-h-[60vh] max-w-full object-contain select-none shadow-3xl"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Next Arrow Button */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleNextPhoto(); }}
                className="absolute right-2 z-20 p-2.5 bg-black/45 hover:bg-black/60 rounded-full text-white transition cursor-pointer md:block hidden active:scale-90"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Metadata Information, Engagement & Swipe Helper on Bottom */}
            <div className="w-full max-w-sm mx-auto pb-4">
              <div className="bg-white/10 backdrop-blur-md border border-white/10 p-4 rounded-3xl flex items-center justify-between text-white shadow-xl">
                <div className="text-left min-w-0 pr-2">
                  <p className="text-sm font-semibold tracking-tight truncate">
                    {photo.author || "Convidado Especial"}
                  </p>
                  <p className="text-[10px] text-stone-400 capitalize font-medium">
                    📍 Categoria: {photo.category}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleLike(photo); }}
                    className={`flex items-center gap-1.5 text-xs font-bold py-2.5 px-4 rounded-full border transition active:scale-95 ${
                      isLiked 
                        ? "bg-[#BF9B30]/20 border-[#BF9B30]/40 text-[#BF9B30]" 
                        : "bg-white/10 border-white/10 hover:border-white/20 text-white"
                    }`}
                  >
                    <Heart 
                      className={`w-4 h-4 transition ${
                        isLiked ? "fill-[#BF9B30] text-[#BF9B30]" : "text-white/60"
                      }`} 
                    />
                    <span>{photo.likesCount || 0}</span>
                  </button>
                </div>
              </div>
              <p className="text-center text-[10px] text-stone-500 mt-2 font-sans overflow-hidden py-1 h-3 block md:hidden">
                ⇠ Deslize para navegar no álbum ⇢
              </p>
            </div>
          </div>
        );
      })()}

      {/* Customized Elegant Deletion Modal */}
      {photoToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-[#E6E8E3] shadow-lg text-center flex flex-col gap-4 text-left">
            <h3 className="font-serif text-base text-[#2F453A] font-semibold text-center">
              Apagar Foto do Álbum?
            </h3>
            <p className="text-xs text-[#788A81] leading-relaxed text-center">
              Tem a certeza de que deseja eliminar esta foto? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhotoToDelete(null)}
                className="flex-1 py-2.5 border border-[#C5CBC6] hover:bg-[#FAF9F5] text-[#2F453A] text-xs font-semibold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl transition shadow-xs"
              >
                Apagar Foto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
