/**
 * GPMG - Configuration & Client Supabase Centralise
 * URL : https://cxurjmymrnekfoajbmdu.supabase.co
 * Role : Anon / Public
 */

const GPMG_SUPABASE_CONFIG = {
  url: "https://cxurjmymrnekfoajbmdu.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4dXJqbXltcm5la2ZvYWpibWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMjY5MTYsImV4cCI6MjExMDcwMjkxNn0.dd1DmKf1RCbX55zGzRO6SAK495QBpISiY6lLNJ9AW_0"
};

// Initialisation globale paresseuse et robuste du client Supabase
window.getGpmgSupabaseClient = function() {
  if (!window.supabaseClient && typeof supabase !== 'undefined' && supabase.createClient) {
    try {
      window.supabaseClient = supabase.createClient(GPMG_SUPABASE_CONFIG.url, GPMG_SUPABASE_CONFIG.anonKey);
      console.log("[GPMG Supabase] Client initialise avec succes :", GPMG_SUPABASE_CONFIG.url);
    } catch (err) {
      console.warn("[GPMG Supabase] Erreur d'initialisation :", err);
    }
  }
  return window.supabaseClient;
};

// Tentative d'initialisation immediate
window.getGpmgSupabaseClient();

// Couche d'acces aux donnees GPMG_DB (Supabase avec fallback LocalStorage)
window.GPMG_DB = {
  getClient() {
    return window.getGpmgSupabaseClient();
  },

  isSupabaseReady() {
    const client = this.getClient();
    return !!(client && client.from);
  },

  // Test de diagnostic de la base
  async testConnection() {
    if (!this.isSupabaseReady()) {
      return { ok: false, error: "Le script Supabase CDN n'a pas pu etre charge. Verifiez votre connexion internet." };
    }
    try {
      const { data, error } = await this.getClient().from('tournaments').select('*').limit(1);
      if (error) {
        return {
          ok: false,
          error: error.message,
          code: error.code,
          hint: error.hint || (error.code === '42P01' ? "La table 'tournaments' n'existe pas encore. Veuillez executer supabase_schema.sql dans Supabase SQL Editor." : "")
        };
      }
      return { ok: true, count: data ? data.length : 0 };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ================= 1. TOURNOIS =================
  async getTournaments() {
    let supabaseTournaments = null;

    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await this.getClient()
          .from('tournaments')
          .select('*')
          .order('datetime', { ascending: true });
        
        if (!error && data && data.length > 0) {
          supabaseTournaments = data.map(t => ({
            id: t.id,
            title: t.title,
            mode: t.mode,
            maxSlots: t.max_slots || t.maxSlots || 12,
            fee: t.fee !== undefined ? t.fee : (t.entry_fee || 0),
            entry_fee: t.fee !== undefined ? t.fee : (t.entry_fee || 0),
            prize: t.prize || t.prize_pool || '0 MGA',
            prize_pool: t.prize || t.prize_pool || '0 MGA',
            datetime: t.datetime,
            status: t.status || 'OUVERT',
            rules: t.rules || '',
            roomId: t.room_id || t.roomId || '',
            roomPublished: t.room_published !== undefined ? t.room_published : (t.roomPublished || false),
            map: t.map || 'Bermuda',
            type: t.type || 'classique'
          }));
          return supabaseTournaments;
        } else if (error) {
          console.warn("[GPMG DB] Erreur lecture Supabase getTournaments :", error.message);
        }
      } catch (e) {
        console.warn("[GPMG DB] Exception Supabase getTournaments :", e);
      }
    }

    // Fallback LocalStorage si Supabase est vide ou erreur
    try {
      const stored = localStorage.getItem('GPMG_THEDARKSHIFT_V4_CLEAN');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.tournaments && parsed.tournaments.length > 0) {
          console.log("[GPMG DB] Utilisation des tournois locaux en cache :", parsed.tournaments.length);
          return parsed.tournaments;
        }
      }
    } catch (e) {}

    return [];
  },

  async saveTournament(tourn) {
    const feeVal = Number(tourn.fee || tourn.entry_fee || 0);
    const prizeVal = String(tourn.prize || tourn.prize_pool || '0 MGA');

    const payload = {
      id: String(tourn.id),
      title: tourn.title,
      mode: tourn.mode,
      max_slots: Number(tourn.maxSlots || tourn.max_slots || 12),
      fee: feeVal,
      entry_fee: feeVal,
      prize: prizeVal,
      prize_pool: prizeVal,
      datetime: tourn.datetime ? new Date(tourn.datetime).toISOString() : new Date().toISOString(),
      status: tourn.status || 'OUVERT',
      rules: tourn.rules || '',
      room_id: tourn.roomId || tourn.room_id || '',
      room_published: !!(tourn.roomPublished !== undefined ? tourn.roomPublished : tourn.room_published)
    };

    let supabaseResult = { success: false };

    // 1. Sauvegarde Supabase
    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await this.getClient()
          .from('tournaments')
          .upsert(payload, { onConflict: 'id' })
          .select();
        
        if (error) {
          console.error("[GPMG DB] Erreur upsert tournament Supabase :", error);
          supabaseResult = { success: false, error: error.message, hint: error.hint, code: error.code };
        } else {
          console.log("[GPMG DB] Tournoi synchronise avec Supabase :", data);
          supabaseResult = { success: true, data };
        }
      } catch (e) {
        console.error("[GPMG DB] Exception Supabase saveTournament :", e);
        supabaseResult = { success: false, error: e.message };
      }
    } else {
      console.warn("[GPMG DB] Supabase non disponible, enregistrement local uniquement.");
      supabaseResult = { success: false, error: "Supabase non connecte" };
    }

    // 2. Synchronisation LocalStorage (pour disponibilite immediate)
    this._syncLocal(state => {
      const idx = state.tournaments.findIndex(t => t.id === tourn.id);
      if (idx !== -1) state.tournaments[idx] = tourn;
      else state.tournaments.push(tourn);
    });

    return supabaseResult;
  },

  async deleteTournament(id) {
    if (this.isSupabaseReady()) {
      try {
        await this.getClient().from('tournaments').delete().eq('id', id);
        await this.getClient().from('registrations').delete().eq('tournament_id', id);
      } catch (e) {}
    }
    this._syncLocal(state => {
      state.tournaments = state.tournaments.filter(t => t.id !== id);
      state.registrations = state.registrations.filter(r => r.tournamentId !== id);
    });
  },

  // ================= 2. INSCRIPTIONS & VALIDATIONS =================
  async getRegistrations(tournamentId = null) {
    if (this.isSupabaseReady()) {
      try {
        let query = this.getClient().from('registrations').select('*').order('created_at', { ascending: false });
        if (tournamentId && tournamentId !== 'all') {
          query = query.eq('tournament_id', tournamentId);
        }
        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          return data.map(r => ({
            id: r.id,
            teamName: r.team_name || r.teamName,
            tournamentId: r.tournament_id || r.tournamentId,
            operator: r.operator,
            smsRef: r.sms_ref || r.smsRef,
            phone: r.phone || '',
            proof_image: r.proof_image || r.screenshot || '',
            timestamp: r.created_at ? new Date(r.created_at).toLocaleString('fr-FR') : (r.timestamp || ''),
            status: r.status || 'pending',
            rejectReason: r.reject_reason || r.rejectReason || ''
          }));
        }
      } catch (e) {
        console.warn("[GPMG DB] Fallback local pour registrations :", e);
      }
    }
    try {
      const stored = localStorage.getItem('GPMG_THEDARKSHIFT_V4_CLEAN');
      if (stored) {
        const parsed = JSON.parse(stored);
        let list = parsed.registrations || [];
        if (tournamentId && tournamentId !== 'all') {
          list = list.filter(r => r.tournamentId === tournamentId);
        }
        return list;
      }
    } catch (e) {}
    return [];
  },

  async createRegistration(regData) {
    const newReg = {
      id: regData.id || ('REG-' + Math.floor(1000 + Math.random() * 9000)),
      team_name: regData.teamName,
      tournament_id: regData.tournamentId,
      operator: regData.operator,
      sms_ref: regData.smsRef,
      phone: regData.phone || '',
      proof_image: regData.proof_image || regData.screenshot || '',
      status: 'pending',
      created_at: new Date().toISOString()
    };

    if (this.isSupabaseReady()) {
      try {
        const { error } = await this.getClient().from('registrations').insert([newReg]);
        if (error) console.warn("[GPMG DB] Erreur insert registration Supabase :", error);
      } catch (e) {}
    }

    const localReg = {
      id: newReg.id,
      teamName: regData.teamName,
      tournamentId: regData.tournamentId,
      operator: regData.operator,
      smsRef: regData.smsRef,
      phone: regData.phone || '',
      proof_image: regData.proof_image || regData.screenshot || '',
      timestamp: new Date().toLocaleString('fr-FR'),
      status: 'pending'
    };

    this._syncLocal(state => {
      state.registrations.push(localReg);
    });

    return localReg;
  },

  async updateRegistrationStatus(id, status, rejectReason = '') {
    if (this.isSupabaseReady()) {
      try {
        await this.getClient()
          .from('registrations')
          .update({ status, reject_reason: rejectReason })
          .eq('id', id);
      } catch (e) {}
    }
    this._syncLocal(state => {
      const reg = state.registrations.find(r => r.id === id);
      if (reg) {
        reg.status = status;
        if (rejectReason) reg.rejectReason = rejectReason;
        else delete reg.rejectReason;
      }
    });
  },

  // ================= 3. SALLE DE MATCH SANS MOT DE PASSE =================
  async updateRoomDetails(tournamentId, roomId, isPublished) {
    if (this.isSupabaseReady()) {
      try {
        await this.getClient()
          .from('tournaments')
          .update({ room_id: roomId, room_published: !!isPublished })
          .eq('id', tournamentId);
      } catch (e) {}
    }
    this._syncLocal(state => {
      const t = state.tournaments.find(tourn => tourn.id === tournamentId);
      if (t) {
        t.roomId = roomId;
        t.roomPublished = !!isPublished;
      }
    });
  },

  // ================= 4. SCORES & MATCH LEADERBOARD =================
  async getMatchScores(tournamentId) {
    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await this.getClient()
          .from('match_scores')
          .select('*')
          .eq('tournament_id', tournamentId);
        
        if (!error && data && data.length > 0) {
          const map = {};
          data.forEach(s => {
            const m = String(s.match_number || 1);
            if (!map[m]) map[m] = [];
            map[m].push({
              teamId: s.team_id,
              rank: s.rank,
              kills: s.kills
            });
          });
          return map;
        }
      } catch (e) {}
    }
    try {
      const stored = localStorage.getItem('GPMG_THEDARKSHIFT_V4_CLEAN');
      if (stored) {
        const parsed = JSON.parse(stored);
        return (parsed.matchScores && parsed.matchScores[tournamentId]) || {};
      }
    } catch (e) {}
    return {};
  },

  // ================= 5. JOUEURS & AUTHENTIFICATION =================
  async registerPlayer(playerData) {
    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await this.getClient()
          .from('players')
          .insert([{
            phone: playerData.phone,
            squad_name: playerData.squad,
            payment_mode: playerData.payment,
            password_hash: playerData.password,
            created_at: new Date().toISOString()
          }])
          .select();
        if (!error && data) return { success: true, player: data[0] };
      } catch (e) {}
    }
    try {
      const players = JSON.parse(localStorage.getItem('GPMG_PLAYERS_LOCAL') || '[]');
      players.push({ ...playerData, created_at: new Date().toISOString() });
      localStorage.setItem('GPMG_PLAYERS_LOCAL', JSON.stringify(players));
      return { success: true, local: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  async loginPlayer(phone, password) {
    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await this.getClient()
          .from('players')
          .select('*')
          .eq('phone', phone)
          .eq('password_hash', password)
          .single();
        
        if (!error && data) return { success: true, player: data };
      } catch (e) {}
    }
    try {
      const players = JSON.parse(localStorage.getItem('GPMG_PLAYERS_LOCAL') || '[]');
      const found = players.find(p => p.phone === phone && (p.password === password || p.password_hash === password));
      if (found) return { success: true, player: found };
    } catch (e) {}
    return { success: false, error: "Identifiants incorrects" };
  },

  // ================= 6. PARAMETRES & UIDS BANNIS =================
  async getSettings() {
    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await this.getClient().from('site_settings').select('*');
        if (!error && data) {
          const map = {};
          data.forEach(row => { map[row.key] = row.value; });
          return map;
        }
      } catch (e) {}
    }
    try {
      const stored = localStorage.getItem('GPMG_THEDARKSHIFT_V4_CLEAN');
      if (stored) return JSON.parse(stored).mobileMoney || {};
    } catch (e) {}
    return {};
  },

  // Helper interne pour synchronisation atomique LocalStorage
  _syncLocal(callback) {
    try {
      const KEY = 'GPMG_THEDARKSHIFT_V4_CLEAN';
      let state = {
        adminPassword: 'admin2026',
        mobileMoney: { orange: { number: '', name: '' }, airtel: { number: '', name: '' } },
        bannedUids: [],
        tournaments: [],
        registrations: [],
        matchScores: {}
      };
      const stored = localStorage.getItem(KEY);
      if (stored) state = JSON.parse(stored);
      callback(state);
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {}
  }
};