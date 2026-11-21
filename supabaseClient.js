/**
 * GPMG - Configuration & Client Supabase Centralise
 * URL : https://cxurjmymrnekfoajbmdu.supabase.co
 * Role : Anon / Public
 */

const GPMG_SUPABASE_CONFIG = {
  url: "https://cxurjmymrnekfoajbmdu.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4dXJqbXltcm5la2ZvYWpibWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxMjY5MTYsImV4cCI6MjExMDcwMjkxNn0.dd1DmKf1RCbX55zGzRO6SAK495QBpISiY6lLNJ9AW_0"
};

// Initialisation globale du client Supabase
if (typeof supabase !== 'undefined' && !window.supabaseClient) {
  try {
    window.supabaseClient = supabase.createClient(GPMG_SUPABASE_CONFIG.url, GPMG_SUPABASE_CONFIG.anonKey);
    console.log("[GPMG Supabase] Client initialise avec succes :", GPMG_SUPABASE_CONFIG.url);
  } catch (err) {
    console.warn("[GPMG Supabase] Erreur d'initialisation :", err);
  }
}

// Couche d'acces aux donnees GPMG_DB (Supabase avec fallback LocalStorage)
window.GPMG_DB = {
  isSupabaseReady() {
    return !!(window.supabaseClient && window.supabaseClient.from);
  },

  // ================= 1. TOURNOIS =================
  async getTournaments() {
    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await window.supabaseClient
          .from('tournaments')
          .select('*')
          .order('datetime', { ascending: true });
        
        if (!error && data) {
          // Normaliser pour l'app
          return data.map(t => ({
            id: t.id,
            title: t.title,
            mode: t.mode,
            maxSlots: t.max_slots || t.maxSlots || 12,
            fee: t.fee || 0,
            prize: t.prize || 0,
            datetime: t.datetime,
            status: t.status || 'OUVERT',
            rules: t.rules || '',
            roomId: t.room_id || t.roomId || '',
            roomPublished: t.room_published !== undefined ? t.room_published : (t.roomPublished || false)
          }));
        }
      } catch (e) {
        console.warn("[GPMG DB] Fallback local pour tournaments :", e);
      }
    }
    // Fallback local
    try {
      const stored = localStorage.getItem('GPMG_THEDARKSHIFT_V4_CLEAN');
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.tournaments || [];
      }
    } catch (e) {}
    return [];
  },

  async saveTournament(tourn) {
    // 1. Sauvegarde Supabase
    if (this.isSupabaseReady()) {
      try {
        const payload = {
          id: tourn.id,
          title: tourn.title,
          mode: tourn.mode,
          max_slots: tourn.maxSlots,
          fee: tourn.fee,
          prize: tourn.prize,
          datetime: tourn.datetime,
          status: tourn.status,
          rules: tourn.rules,
          room_id: tourn.roomId || '',
          room_published: !!tourn.roomPublished
        };
        const { error } = await window.supabaseClient
          .from('tournaments')
          .upsert(payload);
        if (error) console.warn("[GPMG DB] Erreur upsert tournament Supabase :", error);
      } catch (e) {
        console.warn("[GPMG DB] Exception Supabase saveTournament :", e);
      }
    }
    // 2. Synchronisation Local
    this._syncLocal(state => {
      const idx = state.tournaments.findIndex(t => t.id === tourn.id);
      if (idx !== -1) state.tournaments[idx] = tourn;
      else state.tournaments.push(tourn);
    });
  },

  async deleteTournament(id) {
    if (this.isSupabaseReady()) {
      try {
        await window.supabaseClient.from('tournaments').delete().eq('id', id);
        await window.supabaseClient.from('registrations').delete().eq('tournament_id', id);
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
        let query = window.supabaseClient.from('registrations').select('*').order('created_at', { ascending: false });
        if (tournamentId && tournamentId !== 'all') {
          query = query.eq('tournament_id', tournamentId);
        }
        const { data, error } = await query;
        if (!error && data) {
          return data.map(r => ({
            id: r.id,
            teamName: r.team_name || r.teamName,
            tournamentId: r.tournament_id || r.tournamentId,
            operator: r.operator,
            smsRef: r.sms_ref || r.smsRef,
            phone: r.phone || '',
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
      status: 'pending',
      created_at: new Date().toISOString()
    };

    if (this.isSupabaseReady()) {
      try {
        const { error } = await window.supabaseClient.from('registrations').insert([newReg]);
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
        await window.supabaseClient
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
        await window.supabaseClient
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
        const { data, error } = await window.supabaseClient
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
        return parsed.matchScores[tournamentId] || {};
      }
    } catch (e) {}
    return {};
  },

  async saveMatchScores(tournamentId, matchNum, scores) {
    if (this.isSupabaseReady()) {
      try {
        // Supprimer les scores de cette manche avant de re-inserer
        await window.supabaseClient
          .from('match_scores')
          .delete()
          .eq('tournament_id', tournamentId)
          .eq('match_number', parseInt(matchNum, 10));

        const rows = scores.map(s => ({
          tournament_id: tournamentId,
          match_number: parseInt(matchNum, 10),
          team_id: s.teamId,
          rank: s.rank,
          kills: s.kills
        }));

        await window.supabaseClient.from('match_scores').insert(rows);
      } catch (e) {}
    }
    this._syncLocal(state => {
      if (!state.matchScores[tournamentId]) state.matchScores[tournamentId] = {};
      state.matchScores[tournamentId][matchNum] = scores;
    });
  },

  // ================= 5. JOUEURS & AUTHENTIFICATION =================
  async registerPlayer(playerData) {
    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await window.supabaseClient
          .from('players')
          .insert([{
            phone: playerData.phone,
            squad_name: playerData.squad,
            payment_mode: playerData.payment,
            password: playerData.password,
            created_at: new Date().toISOString()
          }])
          .select();
        if (!error && data) return { success: true, player: data[0] };
      } catch (e) {}
    }
    // Sauvegarde fallback local
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
        const { data, error } = await window.supabaseClient
          .from('players')
          .select('*')
          .eq('phone', phone)
          .eq('password', password)
          .single();
        
        if (!error && data) return { success: true, player: data };
      } catch (e) {}
    }
    // Fallback local
    try {
      const players = JSON.parse(localStorage.getItem('GPMG_PLAYERS_LOCAL') || '[]');
      const found = players.find(p => p.phone === phone && p.password === password);
      if (found) return { success: true, player: found };
    } catch (e) {}
    return { success: false, error: "Identifiants incorrects" };
  },

  // ================= 6. PARAMETRES & UIDS BANNIS =================
  async getSettings() {
    if (this.isSupabaseReady()) {
      try {
        const { data, error } = await window.supabaseClient.from('settings').select('*');
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

  async saveSettings(settings) {
    if (this.isSupabaseReady()) {
      try {
        const rows = Object.keys(settings).map(key => ({
          key,
          value: settings[key],
          updated_at: new Date().toISOString()
        }));
        await window.supabaseClient.from('settings').upsert(rows);
      } catch (e) {}
    }
    this._syncLocal(state => {
      state.mobileMoney = settings;
    });
  },

  // Helper interne pour synchronisation atomique LocalStorage
  _syncLocal(callback) {
    try {
      const KEY = 'GPMG_THEDARKSHIFT_V4_CLEAN';
      let state = {
        adminPassword: 'admin2026',
        mobileMoney: { mvola: { number: '', name: '' }, orange: { number: '', name: '' }, airtel: { number: '', name: '' } },
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
