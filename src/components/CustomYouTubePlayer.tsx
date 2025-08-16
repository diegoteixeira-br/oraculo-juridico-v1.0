import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Settings } from 'lucide-react';

interface CustomYouTubePlayerProps {
  videoId: string;
  title: string;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export const CustomYouTubePlayer: React.FC<CustomYouTubePlayerProps> = ({ videoId, title }) => {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true); // Inicia sempre mutado
  const [showAudioPrompt, setShowAudioPrompt] = useState(true); // Mostra prompt de áudio
  const [isReady, setIsReady] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Salvar/carregar posição do vídeo
  const saveVideoPosition = (time: number) => {
    localStorage.setItem(`video_position_${videoId}`, time.toString());
  };

  const getSavedVideoPosition = (): number => {
    const saved = localStorage.getItem(`video_position_${videoId}`);
    return saved ? parseFloat(saved) : 0;
  };

  useEffect(() => {
    // Carregar API do YouTube
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        initializePlayer();
      };
    } else {
      initializePlayer();
    }

    return () => {
      if (player) {
        const currentTime = player.getCurrentTime();
        if (currentTime > 0) {
          saveVideoPosition(currentTime);
        }
      }
    };
  }, [videoId]);

  const initializePlayer = () => {
    if (!containerRef.current) return;

    const newPlayer = new window.YT.Player(containerRef.current, {
      height: '100%',
      width: '100%',
      videoId: videoId,
      playerVars: {
        autoplay: 1, // Autoplay habilitado
        mute: 1, // Inicia mutado para permitir autoplay
        controls: 0, // Remove controles padrão
        disablekb: 1, // Desabilita teclado
        fs: 0, // Remove fullscreen
        iv_load_policy: 3, // Remove anotações
        modestbranding: 1, // Remove logo do YouTube
        rel: 0, // Remove vídeos relacionados
        showinfo: 0, // Remove informações do vídeo
        cc_load_policy: 1, // Carrega legendas se disponíveis
        hl: 'pt', // Idioma português
        playsinline: 1, // Reproduz inline no mobile
        widget_referrer: window.location.href, // Define referrer
        origin: window.location.origin, // Define origem
        enablejsapi: 1, // Habilita API JS
        end: 0, // Remove tela final com vídeos relacionados
      },
      events: {
        onReady: (event: any) => {
          setPlayer(event.target);
          setIsReady(true);
          
          // Configurar volume inicial
          const savedVolume = localStorage.getItem(`video_volume_${videoId}`);
          if (savedVolume) {
            event.target.setVolume(parseInt(savedVolume));
            setIsMuted(parseInt(savedVolume) === 0);
          }
        },
        onStateChange: (event: any) => {
          const state = event.data;
          setIsPlaying(state === window.YT.PlayerState.PLAYING);
          
          // Salvar posição a cada 5 segundos durante reprodução
          if (state === window.YT.PlayerState.PLAYING) {
            const interval = setInterval(() => {
              if (player && player.getCurrentTime) {
                saveVideoPosition(player.getCurrentTime());
              }
            }, 5000);
            
            playerRef.current = interval;
          } else {
            if (playerRef.current) {
              clearInterval(playerRef.current);
            }
          }
        },
      },
    });
  };

  const handleAudioUnlock = () => {
    if (!player) return;
    
    // Voltar ao começo e liberar áudio
    player.seekTo(0);
    player.unMute();
    player.playVideo();
    setIsMuted(false);
    setShowAudioPrompt(false);
    setHasUserInteracted(true);
  };

  const togglePlayPause = () => {
    if (!player) return;

    if (isPlaying) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  };

  const toggleMute = () => {
    if (!player) return;

    if (isMuted) {
      player.unMute();
      const volume = localStorage.getItem(`video_volume_${videoId}`) || '50';
      player.setVolume(parseInt(volume));
      setIsMuted(false);
    } else {
      localStorage.setItem(`video_volume_${videoId}`, player.getVolume().toString());
      player.mute();
      setIsMuted(true);
    }
  };

  const toggleCaptions = () => {
    if (!player) return;
    
    // Tentar ativar/desativar legendas
    try {
      const options = player.getOptions();
      const captionTracks = options.captions || [];
      if (captionTracks.length > 0) {
        // Alternar entre português e off
        const currentTrack = player.getOption('captions', 'track');
        if (currentTrack && currentTrack.languageCode === 'pt') {
          player.setOption('captions', 'track', {});
        } else {
          const ptTrack = captionTracks.find((track: any) => track.languageCode === 'pt');
          if (ptTrack) {
            player.setOption('captions', 'track', ptTrack);
          }
        }
      }
    } catch (error) {
      console.log('Legendas não disponíveis para este vídeo');
    }
  };

  return (
    <div className="relative max-w-3xl mx-auto">
      <div className="aspect-video bg-slate-800/50 rounded-lg border border-border overflow-hidden shadow-2xl relative">
        {/* Container do player */}
        <div ref={containerRef} className="w-full h-full"></div>
        
        {/* Overlay com controles customizados */}
        {isReady && !showAudioPrompt && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {/* Controles customizados - botões menores */}
            <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-2">
                {/* Play/Pause */}
                <button
                  onClick={togglePlayPause}
                  className="bg-black/70 hover:bg-black/90 text-white p-2 rounded-full transition-all duration-200"
                  aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>

                {/* Mute/Unmute */}
                <button
                  onClick={toggleMute}
                  className="bg-black/70 hover:bg-black/90 text-white p-2 rounded-full transition-all duration-200"
                  aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>

                {/* Legendas */}
                <button
                  onClick={toggleCaptions}
                  className="bg-black/70 hover:bg-black/90 text-white p-2 rounded-full transition-all duration-200"
                  aria-label="Legendas"
                >
                  <Settings size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Prompt central para liberar áudio */}
        {showAudioPrompt && isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-auto">
            <div className="bg-white rounded-lg p-8 text-center shadow-2xl max-w-md mx-4">
              <div className="text-6xl mb-4">🔊</div>
              <h3 className="text-xl font-bold mb-4 text-gray-800">
                Clique para ativar o áudio
              </h3>
              <p className="text-gray-600 mb-6">
                O vídeo está reproduzindo sem som. Clique no botão abaixo para ativar o áudio e reiniciar do começo.
              </p>
              <button
                onClick={handleAudioUnlock}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors duration-200"
              >
                Ativar Áudio e Reiniciar
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-800/50">
            <div className="text-center text-white">
              <div className="text-4xl mb-4">⏳</div>
              <p>Carregando vídeo...</p>
            </div>
          </div>
        )}
      </div>
      
      <div className="mt-6 text-sm text-muted-foreground text-center">
        <p>💡 <strong>Dica:</strong> Use os controles para pausar/reproduzir, ajustar volume e ativar legendas</p>
      </div>
    </div>
  );
};