// Protótipo de Código para Painel de Controle do Assistente Virtual de WhatsApp

// Backend (Node.js com Express)
const express = require('express');
const whatsappAPI = require('./whatsappAPI'); // Biblioteca para integração com WhatsApp
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
app.use(cors());

// Configuração do banco de dados
mongoose.connect('mongodb://localhost:27017/whatsapp-ai', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Modelos do banco de dados
const PhoneNumberSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, default: 'offline' },
  dailyMessageCount: { type: Number, default: 0 },
  dailyLimit: { type: Number, default: 100 },
  lastUsed: { type: Date },
});

const PersonalitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  tone: { type: String, enum: ['formal', 'casual', 'friendly', 'professional'], default: 'professional' },
  responseSpeed: { type: String, enum: ['fast', 'moderate', 'slow'], default: 'moderate' },
  vocabulary: { type: [String] },
  commonPhrases: { type: [String] },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const MessageTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  category: { type: String },
  content: { type: String, required: true },
  variables: { type: [String] }, // Ex: ["{nome}", "{produto}"]
  createdAt: { type: Date, default: Date.now }
});

const CampaignSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  personality: { type: mongoose.Schema.Types.ObjectId, ref: 'Personality' },
  messageSequence: [{
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageTemplate' },
    delay: { type: Number, default: 0 }, // Delay em minutos
    condition: { type: String } // Condição para envio
  }],
  targetGroups: [{ type: String }],
  phoneNumbers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PhoneNumber' }],
  dailyLimit: { type: Number, default: 50 },
  active: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ContactSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String },
  tags: [{ type: String }],
  lastContact: { type: Date },
  conversationHistory: [{
    message: { type: String },
    timestamp: { type: Date, default: Date.now },
    isFromAI: { type: Boolean }
  }],
  engagementScore: { type: Number, default: 0 },
  preferences: { type: Map, of: String },
  doNotDisturb: { type: Boolean, default: false }
});

const PhoneNumber = mongoose.model('PhoneNumber', PhoneNumberSchema);
const Personality = mongoose.model('Personality', PersonalitySchema);
const MessageTemplate = mongoose.model('MessageTemplate', MessageTemplateSchema);
const Campaign = mongoose.model('Campaign', CampaignSchema);
const Contact = mongoose.model('Contact', ContactSchema);

// Limitador de requisições para segurança
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite por IP
  message: "Muitas requisições deste IP, tente novamente mais tarde"
});

// Rotas da API
app.use('/api/', apiLimiter);

// Gerenciamento de números de telefone
app.get('/api/phone-numbers', async (req, res) => {
  try {
    const numbers = await PhoneNumber.find();
    res.json(numbers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/phone-numbers', async (req, res) => {
  try {
    const newNumber = new PhoneNumber(req.body);
    await whatsappAPI.registerNumber(req.body.number); // Integração com API WhatsApp
    await newNumber.save();
    res.status(201).json(newNumber);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Gerenciamento de personalidades
app.get('/api/personalities', async (req, res) => {
  try {
    const personalities = await Personality.find();
    res.json(personalities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/personalities', async (req, res) => {
  try {
    const newPersonality = new Personality(req.body);
    await newPersonality.save();
    res.status(201).json(newPersonality);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Gerenciamento de templates de mensagens
app.get('/api/message-templates', async (req, res) => {
  try {
    const templates = await MessageTemplate.find();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/message-templates', async (req, res) => {
  try {
    const newTemplate = new MessageTemplate(req.body);
    await newTemplate.save();
    res.status(201).json(newTemplate);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Gerenciamento de campanhas
app.get('/api/campaigns', async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .populate('personality')
      .populate('phoneNumbers')
      .populate('messageSequence.template');
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaigns', async (req, res) => {
  try {
    const newCampaign = new Campaign(req.body);
    await newCampaign.save();
    res.status(201).json(newCampaign);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/campaigns/:id/activate', async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    campaign.active = true;
    await campaign.save();
    
    // Iniciar o processamento da campanha
    processCampaign(campaign._id);
    
    res.json({ success: true, message: "Campanha ativada com sucesso" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Gerenciamento de contatos
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await Contact.find();
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts', async (req, res) => {
  try {
    const newContact = new Contact(req.body);
    await newContact.save();
    res.status(201).json(newContact);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Função para processar campanhas ativas
async function processCampaign(campaignId) {
  try {
    const campaign = await Campaign.findById(campaignId)
      .populate('personality')
      .populate('phoneNumbers')
      .populate('messageSequence.template');
    
    if (!campaign.active) return;
    
    // Buscar contatos que correspondem aos grupos alvo
    const contacts = await Contact.find({
      tags: { $in: campaign.targetGroups },
      doNotDisturb: false,
      // Outros filtros para evitar contato excessivo
      lastContact: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Último contato > 24h
    }).limit(campaign.dailyLimit);
    
    // Selecionar número de telefone com menor uso
    const availableNumbers = campaign.phoneNumbers.filter(n => 
      n.dailyMessageCount < n.dailyLimit && n.status === 'online'
    ).sort((a, b) => a.dailyMessageCount - b.dailyMessageCount);
    
    if (availableNumbers.length === 0) {
      console.log(`Campanha ${campaign.name} sem números disponíveis`);
      return;
    }
    
    // Processar contatos
    for (const contact of contacts) {
      // Rotacionar entre números disponíveis
      const phoneNumber = availableNumbers[0];
      
      // Preparar e enviar a primeira mensagem da sequência
      if (campaign.messageSequence.length > 0) {
        const firstMessage = campaign.messageSequence[0];
        const template = firstMessage.template;
        
        // Substituir variáveis no template
        let messageContent = template.content;
        if (contact.name) {
          messageContent = messageContent.replace('{nome}', contact.name);
        }
        
        // Simular características de personalidade
        const personality = campaign.personality;
        if (personality.tone === 'casual') {
          // Adicionar emojis ou gírias para tom casual
          messageContent += ' 😊';
        }
        
        // Enviar mensagem via API do WhatsApp
        try {
          await whatsappAPI.sendMessage(phoneNumber.number, contact.phone, messageContent);
          
          // Atualizar contador do número
          phoneNumber.dailyMessageCount += 1;
          phoneNumber.lastUsed = new Date();
          await phoneNumber.save();
          
          // Registrar contato
          contact.lastContact = new Date();
          contact.conversationHistory.push({
            message: messageContent,
            timestamp: new Date(),
            isFromAI: true
          });
          await contact.save();
          
          // Rotacionar para o próximo número se necessário
          if (phoneNumber.dailyMessageCount >= phoneNumber.dailyLimit) {
            availableNumbers.shift();
          }
          
          // Pausa para simular comportamento humano (variável com base na personalidade)
          const delayTime = personality.responseSpeed === 'fast' ? 2000 : 
                           (personality.responseSpeed === 'moderate' ? 5000 : 10000);
          await new Promise(resolve => setTimeout(resolve, delayTime));
          
        } catch (error) {
          console.error(`Erro ao enviar mensagem para ${contact.phone}:`, error);
        }
      }
    }
  } catch (err) {
    console.error(`Erro ao processar campanha ${campaignId}:`, err);
  }
}

// Iniciar processamento de campanhas ativas periodicamente
setInterval(async () => {
  try {
    const activeCampaigns = await Campaign.find({ active: true });
    for (const campaign of activeCampaigns) {
      processCampaign(campaign._id);
    }
  } catch (err) {
    console.error("Erro ao buscar campanhas ativas:", err);
  }
}, 5 * 60 * 1000); // A cada 5 minutos

// Manipulador de mensagens recebidas do WhatsApp
whatsappAPI.onMessage(async (fromNumber, toNumber, message) => {
  try {
    // Buscar contato
    let contact = await Contact.findOne({ phone: fromNumber });
    if (!contact) {
      // Criar novo contato se não existir
      contact = new Contact({
        phone: fromNumber,
        lastContact: new Date()
      });
    }
    
    // Registrar mensagem recebida
    contact.conversationHistory.push({
      message: message,
      timestamp: new Date(),
      isFromAI: false
    });
    
    // Buscar número que recebeu a mensagem
    const phoneNumber = await PhoneNumber.findOne({ number: toNumber });
    if (!phoneNumber) {
      console.error(`Número ${toNumber} não registrado no sistema`);
      return;
    }
    
    // Processar resposta usando IA
    const aiResponse = await processAIResponse(contact, message, phoneNumber);
    
    // Enviar resposta
    await whatsappAPI.sendMessage(phoneNumber.number, contact.phone, aiResponse);
    
    // Registrar resposta da IA
    contact.conversationHistory.push({
      message: aiResponse,
      timestamp: new Date(),
      isFromAI: true
    });
    
    // Atualizar contato
    contact.lastContact = new Date();
    await contact.save();
    
    // Atualizar contador do número
    phoneNumber.dailyMessageCount += 1;
    await phoneNumber.save();
    
  } catch (err) {
    console.error("Erro ao processar mensagem recebida:", err);
  }
});

// Processar resposta da IA
async function processAIResponse(contact, message, phoneNumber) {
  // Esta é uma função simplificada. Em um sistema real, 
  // aqui seria integrado um modelo de IA como GPT ou similar
  
  // Analisar histórico de conversa para manter contexto
  const recentHistory = contact.conversationHistory.slice(-5);
  
  // Exemplo simples de resposta
  if (message.toLowerCase().includes('olá') || message.toLowerCase().includes('oi')) {
    return `Olá${contact.name ? ' '+contact.name : ''}! Como posso ajudar você hoje?`;
  } else if (message.toLowerCase().includes('preço')) {
    return 'Temos várias opções de preços disponíveis. Poderia me dizer qual produto específico você está interessado?';
  } else if (message.toLowerCase().includes('humano') || message.toLowerCase().includes('atendente')) {
    return 'Entendo que você prefira falar com um de nossos atendentes. Vou encaminhar sua conversa agora. Um momento por favor.';
    // Aqui seria implementada a lógica para notificar um atendente humano
  } else {
    return 'Obrigado por sua mensagem. Estou processando sua solicitação e responderei em breve.';
  }
}

// Iniciar o servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// Frontend (React) - Componentes principais

/*
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Componente principal do painel
function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  
  return (
    <div className="dashboard">
      <header>
        <h1>Painel de Controle - Assistente de WhatsApp</h1>
        <nav>
          <button 
            className={activeTab === 'overview' ? 'active' : ''} 
            onClick={() => setActiveTab('overview')}>
            Visão Geral
          </button>
          <button 
            className={activeTab === 'numbers' ? 'active' : ''} 
            onClick={() => setActiveTab('numbers')}>
            Números
          </button>
          <button 
            className={activeTab === 'personalities' ? 'active' : ''} 
            onClick={() => setActiveTab('personalities')}>
            Personalidades
          </button>
          <button 
            className={activeTab === 'messages' ? 'active' : ''} 
            onClick={() => setActiveTab('messages')}>
            Mensagens
          </button>
          <button 
            className={activeTab === 'campaigns' ? 'active' : ''} 
            onClick={() => setActiveTab('campaigns')}>
            Campanhas
          </button>
          <button 
            className={activeTab === 'contacts' ? 'active' : ''} 
            onClick={() => setActiveTab('contacts')}>
            Contatos
          </button>
          <button 
            className={activeTab === 'reports' ? 'active' : ''} 
            onClick={() => setActiveTab('reports')}>
            Relatórios
          </button>
        </nav>
      </header>
      
      <main>
        {activeTab === 'overview' && <OverviewPanel />}
        {activeTab === 'numbers' && <PhoneNumbersPanel />}
        {activeTab === 'personalities' && <PersonalitiesPanel />}
        {activeTab === 'messages' && <MessagesPanel />}
        {activeTab === 'campaigns' && <CampaignsPanel />}
        {activeTab === 'contacts' && <ContactsPanel />}
        {activeTab === 'reports' && <ReportsPanel />}
      </main>
    </div>
  );
}

// Painel de gerenciamento de personalidades
function PersonalitiesPanel() {
  const [personalities, setPersonalities] = useState([]);
  const [newPersonality, setNewPersonality] = useState({
    name: '',
    tone: 'professional',
    responseSpeed: 'moderate',
    vocabulary: '',
    commonPhrases: '',
    description: ''
  });
  
  useEffect(() => {
    fetchPersonalities();
  }, []);
  
  const fetchPersonalities = async () => {
    try {
      const res = await axios.get('/api/personalities');
      setPersonalities(res.data);
    } catch (err) {
      alert('Erro ao carregar personalidades: ' + err.message);
    }
  };
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewPersonality({
      ...newPersonality,
      [name]: value
    });
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Processar arrays
      const formattedPersonality = {
        ...newPersonality,
        vocabulary: newPersonality.vocabulary.split(',').map(item => item.trim()),
        commonPhrases: newPersonality.commonPhrases.split('\n').map(item => item.trim())
      };
      
      await axios.post('/api/personalities', formattedPersonality);
      alert('Personalidade criada com sucesso!');
      fetchPersonalities();
      // Limpar formulário
      setNewPersonality({
        name: '',
        tone: 'professional',
        responseSpeed: 'moderate',
        vocabulary: '',
        commonPhrases: '',
        description: ''
      });
    } catch (err) {
      alert('Erro ao criar personalidade: ' + err.message);
    }
  };
  
  return (
    <div className="panel personalities-panel">
      <h2>Gerenciar Personalidades</h2>
      
      <div className="personalities-list">
        <h3>Personalidades Existentes</h3>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Tom</th>
              <th>Velocidade</th>
              <th>Descrição</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {personalities.map(personality => (
              <tr key={personality._id}>
                <td>{personality.name}</td>
                <td>{personality.tone}</td>
                <td>{personality.responseSpeed}</td>
                <td>{personality.description}</td>
                <td>
                  <button>Editar</button>
                  <button>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="create-personality">
        <h3>Criar Nova Personalidade</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nome:</label>
            <input 
              type="text" 
              name="name" 
              value={newPersonality.name}
              onChange={handleInputChange}
              required 
            />
          </div>
          
          <div className="form-group">
            <label>Tom de Conversa:</label>
            <select 
              name="tone" 
              value={newPersonality.tone}
              onChange={handleInputChange}
            >
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="friendly">Amigável</option>
              <option value="professional">Profissional</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Velocidade de Resposta:</label>
            <select 
              name="responseSpeed" 
              value={newPersonality.responseSpeed}
              onChange={handleInputChange}
            >
              <option value="fast">Rápida</option>
              <option value="moderate">Moderada</option>
              <option value="slow">Lenta (mais natural)</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Vocabulário Preferido (separado por vírgulas):</label>
            <input 
              type="text" 
              name="vocabulary" 
              value={newPersonality.vocabulary}
              onChange={handleInputChange}
              placeholder="Ex: certamente, perfeito, com prazer"
            />
          </div>
          
          <div className="form-group">
            <label>Frases Comuns (uma por linha):</label>
            <textarea 
              name="commonPhrases" 
              value={newPersonality.commonPhrases}
              onChange={handleInputChange}
              placeholder="Ex: Como posso ajudar hoje?\nFico feliz em poder auxiliar."
              rows="4"
            ></textarea>
          </div>
          
          <div className="form-group">
            <label>Descrição:</label>
            <textarea 
              name="description" 
              value={newPersonality.description}
              onChange={handleInputChange}
              placeholder="Descreva esta personalidade"
              rows="3"
            ></textarea>
          </div>
          
          <button type="submit" className="btn-primary">Criar Personalidade</button>
        </form>
      </div>
    </div>
  );
}

// Outros componentes seriam implementados de forma similar:
// - PhoneNumbersPanel
// - MessagesPanel
// - CampaignsPanel
// - ContactsPanel
// - ReportsPanel
// - OverviewPanel
*/
