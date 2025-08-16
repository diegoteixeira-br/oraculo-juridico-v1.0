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
  const [showAudioPrompt, setShowAudioPrompt] = useState(false); // Aviso vermelho para novos usuários
  const [showResumePrompt, setShowResumePrompt] = useState(false); // Aviso verde/azul para quem volta
  const [isReady, setIsReady] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [canPause, setCanPause] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedControls, setShowSpeedControls] = useState(false);

  // Salvar/carregar posição do vídeo
  const saveVideoPosition = (time: number) => {
    localStorage.setItem(`video_position_${videoId}`, time.toString());
  };

  const getSavedVideoPosition = (): number => {
    const saved = localStorage.getItem(`video_position_${videoId}`);
    return saved ? parseFloat(saved) : 0;
  };

  useEffect(() => {
    // Verificar se há posição salva e se usuário já interagiu antes
    const savedPosition = getSavedVideoPosition();
    const hasInteractedBefore = localStorage.getItem(`user_interacted_${videoId}`) === 'true';
    
    if (savedPosition > 0 && hasInteractedBefore) {
      // Usuário já assistiu antes - mostrar prompt verde/azul
      setShowResumePrompt(true);
    } else {
      // Usuário novo - mostrar prompt vermelho
      setShowAudioPrompt(true);
    }

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

    // Salvar posição quando sair da página e resetar velocidade
    const handleBeforeUnload = () => {
      if (player && player.getCurrentTime) {
        const currentTime = player.getCurrentTime();
        if (currentTime > 0) {
          saveVideoPosition(currentTime);
        }
        // Resetar velocidade para 1x ao sair
        player.setPlaybackRate(1);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
        cc_load_policy: 0, // Desabilita legendas
        hl: 'pt', // Idioma português
        playsinline: 1, // Reproduz inline no mobile
        widget_referrer: window.location.href, // Define referrer
        origin: window.location.origin, // Define origem
        enablejsapi: 1, // Habilita API JS
        end: 0, // Remove tela final com vídeos relacionados
        branding: 0, // Remove marca do YouTube
        autohide: 1, // Esconde controles automaticamente
        loop: 0, // Não fazer loop
        playlist: videoId, // Define playlist como o próprio vídeo para evitar sugestões
        title: 0, // Remove título
        byline: 0, // Remove informações do canal
      },
      events: {
        onReady: (event: any) => {
          setPlayer(event.target);
          setIsReady(true);
          setDuration(event.target.getDuration());
          
          // Configurar volume inicial
          const savedVolume = localStorage.getItem(`video_volume_${videoId}`);
          if (savedVolume) {
            event.target.setVolume(parseInt(savedVolume));
            setIsMuted(parseInt(savedVolume) === 0);
          }

          // Sempre iniciar na velocidade 1x
          event.target.setPlaybackRate(1);
          setPlaybackRate(1);

          // Atualizar tempo atual a cada segundo
          const timeInterval = setInterval(() => {
            if (event.target && event.target.getCurrentTime) {
              setCurrentTime(event.target.getCurrentTime());
            }
          }, 1000);
          
          return () => clearInterval(timeInterval);
        },
        onStateChange: (event: any) => {
          const state = event.data;
          setIsPlaying(state === window.YT.PlayerState.PLAYING);
          
          // Detectar quando o vídeo termina
          if (state === window.YT.PlayerState.ENDED) {
            setVideoEnded(true);
          }
          
          // Quando pausar, mostrar novamente o aviso de áudio SOMENTE quando sair da página
          if (state === window.YT.PlayerState.PAUSED && hasUserInteracted) {
            // Não fazer nada - pause só deve acontecer quando sair da página
          }
          
          // Se tentar pausar por clique após interação, continuar reproduzindo
          if (state === window.YT.PlayerState.PAUSED && hasUserInteracted && !canPause) {
            player.playVideo();
          }
          
          // Salvar posição a cada 5 segundos durante reprodução
          if (state === window.YT.PlayerState.PLAYING) {
            setVideoEnded(false); // Reset quando começa a reproduzir novamente
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
    
    // Para usuários novos, sempre começar do início
    player.seekTo(0);
    localStorage.setItem(`user_interacted_${videoId}`, 'true');
    
    player.unMute();
    player.playVideo();
    setIsMuted(false);
    setShowAudioPrompt(false);
    setHasUserInteracted(true);
    setCanPause(false); // Depois de dar play, não pode mais pausar
  };

  const handleStartFromBeginning = () => {
    if (!player) return;
    localStorage.removeItem(`video_position_${videoId}`);
    localStorage.setItem(`user_interacted_${videoId}`, 'true');
    player.seekTo(0);
    player.unMute();
    player.playVideo();
    setIsMuted(false);
    setShowResumePrompt(false);
    setShowAudioPrompt(false);
    setHasUserInteracted(true);
    setCanPause(false);
  };

  const handleResumeFromSaved = () => {
    if (!player) return;
    const savedPosition = getSavedVideoPosition();
    localStorage.setItem(`user_interacted_${videoId}`, 'true');
    player.seekTo(savedPosition);
    player.unMute();
    player.playVideo();
    setIsMuted(false);
    setShowResumePrompt(false);
    setShowAudioPrompt(false);
    setHasUserInteracted(true);
    setCanPause(false);
  };

  const togglePlayPause = () => {
    if (!player || !canPause) return;

    if (isPlaying && canPause) {
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

  const handleWatchAgain = () => {
    if (!player) return;
    player.seekTo(0);
    player.playVideo();
    setVideoEnded(false);
  };

  const changePlaybackRate = (rate: number) => {
    if (!player) return;
    player.setPlaybackRate(rate);
    setPlaybackRate(rate);
    // Não salvar mais a velocidade
  };

  return (
    <div className="relative max-w-3xl mx-auto">
      <div className="aspect-video bg-slate-800/50 rounded-lg border border-border overflow-hidden shadow-2xl relative">
        {/* Container do player */}
        <div ref={containerRef} className="w-full h-full"></div>
        
        {/* Prompt central para liberar áudio */}
        {showAudioPrompt && isReady && (
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-auto cursor-pointer"
            onClick={handleAudioUnlock}
          >
            <div className="bg-red-500/40 backdrop-blur-sm rounded-lg p-3 sm:p-4 text-center shadow-2xl w-48 sm:w-56 border-2 border-red-400/60 pulse">
              <div className="text-xl sm:text-2xl mb-2 animate-bounce">🔊</div>
              <h3 className="text-xs sm:text-sm font-bold mb-2 text-white">
                Clique para ativar o áudio
              </h3>
              <p className="text-red-100 mb-2 text-xs">
                {hasUserInteracted 
                  ? "O vídeo está pausado. Clique para continuar com áudio."
                  : "Clique para ativar o áudio e reiniciar."
                }
              </p>
              <div className="text-xs text-red-200 pulse">
                👆 Clique aqui
              </div>
            </div>
          </div>
        )}

        {/* Modal verde/azul para quem volta - similar ao vermelho mas com cor diferente */}
        {showResumePrompt && isReady && (
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-auto"
          >
            <div className="bg-green-500/40 backdrop-blur-sm rounded-lg p-3 sm:p-4 text-center shadow-2xl w-48 sm:w-56 border-2 border-green-400/60 pulse">
              <div className="text-lg sm:text-xl mb-2 animate-bounce">🎬</div>
              <h3 className="text-xs sm:text-sm font-bold mb-2 text-white">
                Continuar assistindo?
              </h3>
              <p className="text-green-100 mb-2 text-xs">
                Já assistiu parte. Continuar ou começar do início?
              </p>
              <div className="flex gap-1 sm:gap-2 justify-center mt-2">
                <button
                  onClick={handleResumeFromSaved}
                  className="bg-green-600/80 hover:bg-green-700/80 text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded font-semibold transition-all duration-200 shadow-lg text-xs backdrop-blur-sm"
                >
                  Continuar
                </button>
                <button
                  onClick={handleStartFromBeginning}
                  className="bg-blue-600/80 hover:bg-blue-700/80 text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded font-semibold transition-all duration-200 shadow-lg text-xs backdrop-blur-sm"
                >
                  Do início
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Botão Assistir Novamente - só aparece quando vídeo termina */}
        {videoEnded && !showAudioPrompt && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-auto">
            <button
              onClick={handleWatchAgain}
              className="bg-red-500 hover:bg-red-600 text-white px-4 sm:px-8 py-2 sm:py-4 rounded-lg font-semibold text-sm sm:text-lg transition-all duration-200 shadow-2xl border-2 border-red-400"
            >
              ▶️ Assistir Novamente
            </button>
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
      
      {/* Barra de progresso externa - só a barra sem tempo */}
      {isReady && !showAudioPrompt && !showResumePrompt && !videoEnded && duration > 0 && (
        <div className="mt-3 px-2">
          <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-red-500 h-full transition-all duration-200"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            ></div>
          </div>
        </div>
      )}
      
      {/* Controles de velocidade discretos */}
      {isReady && !showAudioPrompt && !showResumePrompt && !videoEnded && (
        <div className="mt-2 flex items-center justify-end gap-1">
          {!showSpeedControls ? (
            <button
              onClick={() => setShowSpeedControls(true)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
            >
              <Settings className="w-3 h-3" />
              {playbackRate}x
            </button>
          ) : (
            <>
              <span className="text-xs text-gray-500 dark:text-gray-500">Velocidade:</span>
              {[1, 1.5, 2].map(rate => (
                <button
                  key={rate}
                  onClick={() => {
                    changePlaybackRate(rate);
                    setShowSpeedControls(false);
                  }}
                  className={`px-1 py-0.5 rounded text-xs transition-all duration-200 ${
                    playbackRate === rate
                      ? 'bg-red-400 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {rate}x
                </button>
              ))}
              <button
                onClick={() => setShowSpeedControls(false)}
                className="px-1 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200"
              >
                ✕
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};