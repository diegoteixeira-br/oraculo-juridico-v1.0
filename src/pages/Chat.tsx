import { useState, useRef, useEffect } from "react";
import { MessageCircle, Settings, LogOut, Send, Bot, User, Clock, CreditCard, History, Plus, Trash2, MoreHorizontal, Paperclip, X, FileText, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import ReactMarkdown from "react-markdown";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import UserMenu from "@/components/UserMenu";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  attachedFiles?: AttachedFile[];
}

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  data: string; // base64 encoded
}

interface ChatSession {
  id: string;
  title: string;
  preview: string;
  timestamp: Date;
  messages: Message[];
}

const exampleQuestions = [
  "Quais os requisitos da usucapião extraordinária segundo o Código Civil?",
  "Como calcular o prazo prescricional para cobrança de honorários advocatícios?",
  "Qual a diferença entre danos morais e danos estéticos na jurisprudência do STJ?",
  "Quando é cabível a prisão civil por dívida alimentícia e quais os procedimentos?",
  "Quais os critérios para configuração do abandono de emprego na CLT?",
  "Como funciona a sucessão trabalhista em casos de terceirização?",
  "Qual o procedimento para execução de título extrajudicial no CPC/2015?",
  "Quando é possível a desconsideração da personalidade jurídica?",
  "Quais as hipóteses de rescisão indireta do contrato de trabalho?",
  "Como aplicar o princípio da insignificância no direito penal?",
  "Qual a natureza jurídica do FGTS e como funciona sua cobrança?",
  "Quando é cabível a tutela de urgência no processo civil?"
];

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [hasUnsavedMessages, setHasUnsavedMessages] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, profile, signOut, useTokens, refreshProfile } = useAuth();
  const { toast } = useToast();

  const userName = profile?.full_name || user?.email || "Usuário";
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  // Sistema de tokens - separar diários dos do plano
  const planTokens = Number(profile?.plan_tokens || 0); // Tokens do plano/comprados
  const dailyTokens = Number(profile?.daily_tokens || 0); // Tokens diários gratuitos
  const totalTokens = dailyTokens + planTokens; // Total disponível (soma dos dois)
  const userPlanType = profile?.plan_type || 'gratuito';

  // Função para lidar com seleção de arquivos
  const handleFileSelection = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    
    if (files.length === 0) return;
    
    // Verificar limite de arquivos
    if (attachedFiles.length + files.length > 3) {
      toast({
        title: "Limite de arquivos excedido",
        description: "Você pode enviar até 3 arquivos por vez.",
        variant: "destructive",
      });
      return;
    }
    
    // Processar cada arquivo
    files.forEach((file) => {
      // Verificar tamanho do arquivo (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Arquivo muito grande",
          description: `O arquivo ${file.name} é maior que 10MB.`,
          variant: "destructive",
        });
        return;
      }
      
      // Verificar tipo de arquivo
      const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.png', '.jpg', '.jpeg', '.webp'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      
      if (!allowedTypes.includes(fileExtension)) {
        toast({
          title: "Tipo de arquivo não suportado",
          description: `O arquivo ${file.name} não é suportado. Use: PDF, DOC, DOCX, TXT, PNG, JPG, JPEG, WEBP.`,
          variant: "destructive",
        });
        return;
      }
      
      // Converter arquivo para base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        
        const newFile: AttachedFile = {
          name: file.name,
          type: file.type,
          size: file.size,
          data: base64
        };
        
        setAttachedFiles(prev => [...prev, newFile]);
      };
      reader.readAsDataURL(file);
    });
    
    // Limpar input
    if (event.target) {
      event.target.value = '';
    }
  };

  // Função para remover arquivo anexado
  const removeAttachedFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Função para abrir seletor de arquivos
  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() && attachedFiles.length === 0) return;

    // Verificar se o usuário tem tokens suficientes
    if (totalTokens < 1000) { // Aumentar o mínimo para 1000 tokens
      toast({
        title: "Tokens insuficientes",
        description: userPlanType === 'gratuito' 
          ? "Você precisa de pelo menos 1.000 tokens para realizar uma consulta. Aguarde a renovação dos tokens diários ou adquira um plano."
          : "Você não tem tokens suficientes para realizar esta consulta. Compre mais tokens para continuar usando o chat.",
        variant: "destructive",
      });
      navigate('/comprar-creditos');
      return;
    }

    // Criar nova sessão se não existir
    let sessionId = currentSessionId;
    if (!sessionId) {
      // Usar crypto.randomUUID() para gerar um UUID válido
      sessionId = crypto.randomUUID();
      setCurrentSessionId(sessionId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage,
      sender: 'user',
      timestamp: new Date(),
      attachedFiles: attachedFiles.length > 0 ? [...attachedFiles] : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setAttachedFiles([]); // Limpar arquivos anexados
    setIsTyping(true);
    setHasUnsavedMessages(true);

    try {
      // Salvar a mensagem do usuário no histórico
      try {
        await supabase
          .from('query_history')
          .insert({
            user_id: user?.id,
            session_id: sessionId,
            prompt_text: userMessage.text,
            response_text: null,
            message_type: 'user_query',
            credits_consumed: 0
          });
      } catch (historyError) {
        console.error('Erro ao salvar mensagem do usuário no histórico:', historyError);
      }

      // Chamar o edge function que se conecta ao seu webhook
      const { data, error } = await supabase.functions.invoke('legal-ai-chat', {
        body: {
          message: userMessage.text,
          userId: user?.id,
          attachedFiles: userMessage.attachedFiles || []
        }
      });

      if (error) {
        console.error('Error calling legal AI:', error);
        throw new Error(error.message || 'Erro na comunicação com a IA');
      }

      // Verificar se há erro retornado pelo webhook
      if (data.error) {
        console.error('Webhook error details:', data);
        
        // Mensagens de erro mais específicas
        let errorDescription = data.error;
        
        if (data.webhookStatus === 401 || data.webhookStatus === 403) {
          errorDescription = "Erro de autorização com o servidor de IA. Entre em contato com o suporte.";
        } else if (data.webhookStatus === 404) {
          errorDescription = "Serviço de IA temporariamente indisponível. Tente novamente em alguns minutos.";
        } else if (data.webhookStatus >= 500) {
          errorDescription = "Erro interno do servidor de IA. Nossa equipe foi notificada.";
        } else if (data.error.includes('Authorization data is wrong')) {
          errorDescription = "Problema na configuração de acesso à IA. Entre em contato com o suporte.";
        }

        throw new Error(errorDescription);
      }

      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response || 'Resposta recebida da IA',
        sender: 'ai',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiResponse]);

      // Salvar a resposta da IA no histórico
      try {
        await supabase
          .from('query_history')
          .insert({
            user_id: user?.id,
            session_id: sessionId,
            prompt_text: userMessage.text, // Manter a pergunta para referência
            response_text: aiResponse.text,
            message_type: 'ai_response',
            credits_consumed: data.creditsConsumed || 0 // Usar os créditos realmente consumidos pela IA
          });
        
        console.log('Resposta da IA salva no histórico:', {
          sessionId,
          responseLength: aiResponse.text.length,
          creditsConsumed: data.creditsConsumed
        });
      } catch (historyError) {
        console.error('Erro ao salvar resposta da IA no histórico:', historyError);
      }

      // Atualizar o histórico local
      await loadChatHistory();

      // Atualizar os créditos após resposta bem-sucedida
      await refreshProfile();

    } catch (error) {
      console.error('Error sending message:', error);
      
      // Remover a mensagem do usuário em caso de erro
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
      
      toast({
        title: "Erro na consulta",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao processar sua consulta. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: "Logout realizado",
        description: "Você foi desconectado com sucesso.",
      });
      navigate('/');
    } catch (error) {
      toast({
        title: "Erro ao sair",
        description: "Ocorreu um erro ao fazer logout. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleMyAccount = () => {
    navigate('/minha-conta');
  };

  const handleExampleClick = (question: string) => {
    setInputMessage(question);
  };

  // Função para rolar para o final do chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Carregar histórico de conversas
  useEffect(() => {
    loadChatHistory();
  }, [user]);

  // Rolar para o final quando mensagens mudarem ou quando estiver digitando
  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const loadChatHistory = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('query_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;

      // Agrupar mensagens por session_id
      const sessionsMap = new Map<string, ChatSession>();
      
      data?.forEach((query) => {
        const sessionKey = query.session_id;
        
        if (!sessionsMap.has(sessionKey)) {
          sessionsMap.set(sessionKey, {
            id: sessionKey,
            title: 'Nova conversa',
            preview: '',
            timestamp: new Date(query.created_at),
            messages: []
          });
        }

        const session = sessionsMap.get(sessionKey)!;
        
        // Adicionar mensagem do usuário
        if (query.message_type === 'user_query' && query.prompt_text) {
          session.messages.push({
            id: `user-${query.id}`,
            text: query.prompt_text,
            sender: 'user',
            timestamp: new Date(query.created_at)
          });
          
          // Usar primeira pergunta como título da sessão
          if (session.title === 'Nova conversa') {
            session.title = query.prompt_text.length > 50 ? 
              query.prompt_text.substring(0, 50) + '...' : 
              query.prompt_text;
          }
        }
        
        // Adicionar resposta da IA
        if (query.message_type === 'ai_response' && query.response_text) {
          session.messages.push({
            id: `ai-${query.id}`,
            text: query.response_text,
            sender: 'ai',
            timestamp: new Date(query.created_at)
          });
          
          // Usar parte da resposta como preview se ainda não tiver
          if (!session.preview) {
            session.preview = query.response_text.substring(0, 80) + '...';
          }
        }
      });

      // Ordenar mensagens dentro de cada sessão por timestamp
      sessionsMap.forEach(session => {
        session.messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        // Atualizar timestamp da sessão para a última mensagem
        if (session.messages.length > 0) {
          session.timestamp = session.messages[session.messages.length - 1].timestamp;
        }
      });

      // Converter para array e ordenar por timestamp (mais recente primeiro)
      const sessions = Array.from(sessionsMap.values())
        .filter(session => session.messages.length > 0) // Apenas sessões com mensagens
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setChatSessions(sessions);
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  const createNewChat = () => {
    // Salvar conversa atual se existir e tiver mensagens não salvas
    if (hasUnsavedMessages && messages.length > 0) {
      // As mensagens já foram salvas individualmente no handleSendMessage
      // Então só precisamos resetar o estado
    }
    
    setMessages([]);
    setCurrentSessionId(null);
    setHasUnsavedMessages(false);
    
    // Recarregar histórico para mostrar a conversa recém-salva
    loadChatHistory();
  };

  const loadChatSession = (session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
  };

  // Função para excluir uma conversa específica (sem confirmação)
  const deleteConversation = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('query_history')
        .delete()
        .eq('session_id', sessionId)
        .eq('user_id', user?.id);

      if (error) throw error;

      // Atualizar estado local
      setChatSessions(prev => prev.filter(session => session.id !== sessionId));
      
      // Se a conversa excluída era a atual, limpar o chat
      if (currentSessionId === sessionId) {
        setMessages([]);
        setCurrentSessionId(null);
      }

      toast({
        title: "Conversa excluída",
        description: "A conversa foi excluída com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao excluir conversa:', error);
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir a conversa. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  // Função para limpar todo o histórico
  const clearAllHistory = async () => {
    try {
      const { error } = await supabase
        .from('query_history')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;

      // Limpar estado local
      setChatSessions([]);
      setMessages([]);
      setCurrentSessionId(null);

      toast({
        title: "Histórico limpo",
        description: "Todo o histórico foi excluído com sucesso.",
      });
    } catch (error) {
      console.error('Erro ao limpar histórico:', error);
      toast({
        title: "Erro ao limpar histórico",
        description: "Não foi possível limpar o histórico. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const AppSidebar = () => (
    <Sidebar className="w-64 md:w-64 w-full bg-slate-800 border-slate-700 flex flex-col">
      <SidebarHeader className="p-4">
        <img 
          src="/lovable-uploads/baf2f459-dae5-46d0-8e62-9d9247ec0b40.png" 
          alt="Oráculo Jurídico" 
          className="w-12 h-12 mx-auto"
        />
        
        {/* Novo Chat Button */}
        <Button
          onClick={createNewChat}
          className="w-full mt-4 flex items-center gap-2 bg-primary hover:bg-primary/90 text-sm"
        >
          <Plus className="w-4 h-4" />
          Nova Conversa
        </Button>
      </SidebarHeader>
      
      <SidebarContent className="px-2 flex-1 flex flex-col">
        {/* Histórico de Conversas */}
        <div className="flex-1">
          <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground">
            <History className="w-4 h-4" />
            Histórico
          </div>
          
          <ScrollArea className="h-full max-h-[calc(100vh-280px)]">
            <div className="space-y-1">
              {chatSessions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Nenhuma conversa ainda
                </p>
              ) : (
                chatSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`relative group p-2 rounded-lg hover:bg-primary/10 ${
                      currentSessionId === session.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full h-auto p-1 flex flex-col items-start text-left justify-start"
                        >
                          <div className="text-xs font-medium truncate w-full text-left">
                            {session.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 text-left">
                            {session.timestamp.toLocaleDateString('pt-BR')}
                          </div>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuItem onClick={() => loadChatSession(session)}>
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Carregar conversa
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => deleteConversation(session.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir conversa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </SidebarContent>
    </Sidebar>
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        
        <main className="flex-1 flex flex-col">
          {/* Header */}
          <header className="h-14 flex items-center justify-between px-4 md:px-6 border-b border-slate-700 bg-slate-800">
            <div className="flex items-center gap-2 md:gap-4">
              <SidebarTrigger className="lg:hidden" />
              <h1 className="text-base md:text-lg font-semibold truncate">Oráculo Jurídico</h1>
            </div>
            <div className="flex items-center gap-2 md:gap-4">
              <UserMenu hideOptions={["chat"]} />
            </div>
          </header>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {/* Messages Area */}
            <ScrollArea className="flex-1 p-2 md:p-4">
              {totalTokens < 1000 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 max-w-2xl mx-auto px-4">
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                      <CreditCard className="w-8 h-8 text-red-400" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-xl font-bold text-red-400">Tokens Insuficientes</h2>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto">
                        Você precisa de pelo menos 1.000 tokens para usar o chat jurídico.
                      </p>
                    </div>
                  </div>
                  
                  <div className="w-full max-w-md bg-red-900/20 border border-red-600/30 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">
                        Tokens Disponíveis
                      </span>
                      <Badge variant="destructive">
                        {totalTokens.toLocaleString()} tokens
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {dailyTokens.toLocaleString()} tokens diários
                      {planTokens > 0 ? ` + ${planTokens.toLocaleString()} tokens do plano` : ''}
                      <br />
                      Renovação diária às 00:00 (3.000 tokens gratuitos)
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button 
                      onClick={() => navigate('/comprar-creditos')}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CreditCard className="mr-2 h-4 w-4" />
                      Comprar Tokens
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => navigate('/dashboard')}
                    >
                      Voltar ao Dashboard
                    </Button>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-2 max-w-6xl mx-auto px-2">
                  <div className="flex flex-col items-center space-y-1">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="w-4 h-4 md:w-5 md:h-5 text-primary" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-base md:text-lg font-semibold">Como posso te ajudar hoje?</h2>
                      <p className="text-xs text-muted-foreground max-w-md mx-auto">
                        Sou sua IA de assistência jurídica. Faça uma pergunta sobre legislação, jurisprudência ou doutrina.
                      </p>
                    </div>
                  </div>
                  
                   {/* Tokens Display - Mais compacto */}
                   <div className="p-2 bg-primary/10 border border-primary/20 rounded-lg max-w-md mx-auto">
                     <p className="text-xs text-primary text-center">
                       💡 Você tem {totalTokens.toLocaleString()} tokens disponíveis 
                       ({dailyTokens.toLocaleString()} tokens diários
                       {planTokens > 0 ? ` + ${planTokens.toLocaleString()} tokens do plano` : ''}). 
                       O custo varia de acordo com o tamanho da consulta.
                     </p>
                   </div>
                  
                  {/* Exemplos de Perguntas - Mais compacto */}
                  <div className="w-full max-w-5xl">
                    <h3 className="text-sm font-medium mb-2 text-center">Exemplos de perguntas:</h3>
                    <TooltipProvider>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1">
                        {exampleQuestions.map((question, index) => (
                          <Tooltip key={index}>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                className="text-left justify-start h-auto p-2 text-xs bg-slate-800 border-slate-600 hover:bg-slate-700 hover:border-primary/50 transition-colors min-h-[50px]"
                                onClick={() => handleExampleClick(question)}
                              >
                                <span className="line-clamp-2 leading-tight">{question}</span>
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs p-2">
                              <p className="text-xs">{question}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </TooltipProvider>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-[70%] p-3 md:p-4 rounded-lg text-sm md:text-base ${
                          message.sender === 'user'
                            ? 'bg-secondary text-secondary-foreground'
                            : 'bg-slate-800 text-foreground'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {message.sender === 'ai' && (
                            <Bot className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                          )}
                           <div className="flex-1">
                              <div className="text-sm leading-relaxed">
                                <ReactMarkdown>{message.text}</ReactMarkdown>
                              </div>
                              
                              {/* Mostrar arquivos anexados na mensagem do usuário */}
                              {message.sender === 'user' && message.attachedFiles && message.attachedFiles.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Paperclip className="w-3 h-3" />
                                    Arquivos anexados:
                                  </div>
                                  <div className="flex flex-wrap gap-1">
                                    {message.attachedFiles.map((file, index) => (
                                      <div
                                        key={index}
                                        className="flex items-center gap-1 bg-primary/10 rounded px-2 py-1 text-xs"
                                      >
                                        {file.type.startsWith('image/') ? (
                                          <Image className="w-3 h-3 text-blue-400" />
                                        ) : (
                                          <FileText className="w-3 h-3 text-green-400" />
                                        )}
                                        <span className="truncate max-w-[80px]">{file.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              <span className="text-xs text-muted-foreground mt-1 block">
                                {message.timestamp.toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          {message.sender === 'user' && (
                            <User className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="max-w-[70%] p-4 rounded-lg bg-slate-800 text-foreground">
                        <div className="flex items-start gap-2">
                          <Bot className="w-5 h-5 mt-0.5 text-primary flex-shrink-0" />
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Invisible div to scroll to */}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input Area - Mais compacto */}
            <div className="p-2 md:p-4 border-t border-slate-700 bg-slate-800">
              {/* Arquivos Anexados */}
              {attachedFiles.length > 0 && (
                <div className="mb-2 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="w-3 h-3" />
                    Arquivos anexados ({attachedFiles.length}/3):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {attachedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 bg-slate-700 rounded-lg px-3 py-2 text-xs"
                      >
                        {file.type.startsWith('image/') ? (
                          <Image className="w-3 h-3 text-blue-400" />
                        ) : (
                          <FileText className="w-3 h-3 text-green-400" />
                        )}
                        <span className="max-w-[100px] truncate">{file.name}</span>
                        <span className="text-muted-foreground">
                          ({(file.size / 1024).toFixed(1)}KB)
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachedFile(index)}
                          className="h-4 w-4 p-0 hover:bg-red-500/20"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex gap-2">
                <div className="flex gap-1">
                   {/* Botão de Anexar Arquivo */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openFileSelector}
                    disabled={isTyping || attachedFiles.length >= 3 || totalTokens < 1000}
                    className="p-2 md:p-3 w-10 h-10 md:w-12 md:h-12 rounded-lg border-slate-600 hover:bg-slate-700"
                    title={totalTokens < 1000 ? "Tokens insuficientes" : "Anexar arquivo (PDF, imagem, documento)"}
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  
                  {/* Input file invisível */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.webp"
                    onChange={handleFileSelection}
                    className="hidden"
                  />
                </div>
                
                <Textarea
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={totalTokens < 1000 
                    ? "Tokens insuficientes para usar o chat..." 
                    : "Digite sua pergunta aqui e pressione Enter..."
                  }
                  className="flex-1 min-h-[40px] md:min-h-[50px] text-sm resize-none bg-background border-slate-600 focus:border-primary"
                  disabled={isTyping || totalTokens < 1000}
                />
                
                <Button
                  onClick={totalTokens < 1000 ? () => navigate('/comprar-creditos') : handleSendMessage}
                  disabled={totalTokens >= 1000 && ((!inputMessage.trim() && attachedFiles.length === 0) || isTyping)}
                  className={totalTokens < 1000 
                    ? "bg-green-600 hover:bg-green-700 p-2 md:p-3 w-10 h-10 md:w-12 md:h-12 rounded-lg" 
                    : "btn-primary p-2 md:p-3 w-10 h-10 md:w-12 md:h-12 rounded-lg"
                  }
                >
                  {totalTokens < 1000 ? <CreditCard className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>

              {/* Tokens Display com Barra de Progresso */}
              <div className="mt-2 p-3 bg-slate-700 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <Badge 
                      variant="default" 
                      className={`text-xs ${totalTokens > 10000 ? 'bg-primary' : totalTokens > 1000 ? 'bg-yellow-600' : 'bg-red-600'}`}
                    >
                      {totalTokens.toLocaleString()} tokens
                    </Badge>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      (custo variável por consulta)
                    </span>
                  </div>
                  {userPlanType === 'gratuito' && (
                    <span className="text-xs text-green-400">
                      {dailyTokens.toLocaleString()} diários
                    </span>
                  )}
                </div>
                
                {/* Barra de Progresso dos Tokens */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Tokens Disponíveis</span>
                    <span>{totalTokens.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-slate-600 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-300 ${
                        totalTokens > 50000 ? 'bg-green-500' : 
                        totalTokens > 10000 ? 'bg-yellow-500' : 
                        'bg-red-500'
                      }`}
                      style={{ 
                        width: `${Math.min((totalTokens / (userPlanType === 'premium' ? 150000 : userPlanType === 'basico' ? 75000 : 3000)) * 100, 100)}%` 
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
