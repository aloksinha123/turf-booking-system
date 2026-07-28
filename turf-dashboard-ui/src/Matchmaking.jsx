import React, { useState, useEffect } from 'react';

export default function Matchmaking({ apiBase, token, user, triggerAlert }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sportFilter, setSportFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailMatch, setDetailMatch] = useState(null);
  const [payMatchModal, setPayMatchModal] = useState(null); // { match, clientSecret, isCreator }

  // Form state for creating match
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [formSlotId, setFormSlotId] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSport, setFormSport] = useState('football');
  const [formSkill, setFormSkill] = useState('any');
  const [formVisibility, setFormVisibility] = useState('public');
  const [formRequiredPlayers, setFormRequiredPlayers] = useState(10);
  const [submittingCreate, setSubmittingCreate] = useState(false);

  // Fetch matches
  const fetchMatches = async () => {
    try {
      setLoading(true);
      let url = `${apiBase}/api/v1/matches?status=${statusFilter}`;
      if (sportFilter) url += `&sport=${sportFilter}`;
      if (skillFilter) url += `&skill_level=${skillFilter}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setMatches(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch matches', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [sportFilter, skillFilter, statusFilter, search]);

  // WebSocket Listener for real-time match updates
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8085/ws`);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.event === 'match_created' ||
          data.event === 'match_update' ||
          data.event === 'match_cancelled' ||
          data.event === 'match_expired'
        ) {
          fetchMatches();
        }
      } catch (e) {}
    };
    return () => ws.close();
  }, []);

  // Fetch slots for creating match
  const loadAvailableSlots = async () => {
    try {
      setLoadingSlots(true);
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`${apiBase}/slots/available?turf_id=1&date=${today}`);
      const data = await res.json();
      if (res.ok) {
        setAvailableSlots(data || []);
      }
    } catch (err) {
      triggerAlert('Failed to load available slots', true);
    } finally {
      setLoadingSlots(false);
    }
  };

  const openCreateModal = () => {
    if (!token) {
      triggerAlert('Please log in first to host a match', true);
      return;
    }
    setCreateModalOpen(true);
    loadAvailableSlots();
  };

  const handleCreateMatch = async (e) => {
    e.preventDefault();
    if (!formSlotId) return triggerAlert('Please select a slot', true);
    if (!formTitle) return triggerAlert('Please enter a match title', true);

    try {
      setSubmittingCreate(true);
      const res = await fetch(`${apiBase}/api/v1/matches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          slot_id: parseInt(formSlotId),
          title: formTitle,
          sport: formSport,
          skill_level: formSkill,
          visibility: formVisibility,
          required_players: parseInt(formRequiredPlayers)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create match');

      triggerAlert('Match created! Complete your host share payment to confirm.', false);
      setCreateModalOpen(false);
      setFormTitle('');
      setFormSlotId('');

      // Open mock payment modal for host
      setPayMatchModal({
        match: data.match,
        clientSecret: data.client_secret,
        price: data.price_per_player,
        isCreator: true
      });
      fetchMatches();
    } catch (err) {
      triggerAlert(err.message, true);
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleJoinMatch = async (match) => {
    if (!token) return triggerAlert('Please log in to join a match', true);

    try {
      const res = await fetch(`${apiBase}/api/v1/matches/${match.id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join match');

      triggerAlert('Joined match! Proceed to payment to secure your spot.', false);
      setPayMatchModal({
        match,
        clientSecret: data.client_secret,
        price: data.price_per_player,
        isCreator: false
      });
      fetchMatches();
    } catch (err) {
      triggerAlert(err.message, true);
    }
  };

  const handleLeaveMatch = async (matchId) => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/api/v1/matches/${matchId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to leave match');

      triggerAlert('You have left the match.', false);
      setDetailMatch(null);
      fetchMatches();
    } catch (err) {
      triggerAlert(err.message, true);
    }
  };

  const handleCancelMatch = async (matchId) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to cancel this match? All paid players will be refunded.')) return;

    try {
      const res = await fetch(`${apiBase}/api/v1/matches/${matchId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel match');

      triggerAlert(data.message, false);
      setDetailMatch(null);
      fetchMatches();
    } catch (err) {
      triggerAlert(err.message, true);
    }
  };

  const handlePayMockMatch = async () => {
    if (!payMatchModal) return;
    try {
      const res = await fetch(`${apiBase}/webhooks/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_id: payMatchModal.match.id,
          user_id: user?.id,
          status: 'success'
        })
      });
      if (res.ok) {
        triggerAlert('Payment successful! You are fully registered.', false);
        setPayMatchModal(null);
        fetchMatches();
      }
    } catch (err) {
      triggerAlert('Payment failed', true);
    }
  };

  // Helper getters
  const selectedSlot = availableSlots.find((s) => s.id === parseInt(formSlotId));
  const calculatedPrice = selectedSlot ? (selectedSlot.base_price / formRequiredPlayers).toFixed(2) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-indigo-950 rounded-3xl p-8 mb-8 text-white shadow-2xl relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-bold px-3 py-1 rounded-full mb-3 uppercase tracking-wider">
              <span>⚽</span> Real-time Public Matchmaking
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight uppercase">Public Matches & Squad Finder</h1>
            <p className="text-slate-400 text-sm mt-2 max-w-xl font-medium">
              Join open matches in your area, split turf booking fees with other players, or host your own public game!
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wider px-6 py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 active:scale-95 text-xs whitespace-nowrap cursor-pointer"
          >
            ➕ Host a Match
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-8 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-grow">
          {/* Search Input */}
          <div className="relative flex-grow max-w-xs">
            <input
              type="text"
              placeholder="Search match title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500"
            />
            <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
          </div>

          {/* Sport Filter */}
          <select
            value={sportFilter}
            onChange={(e) => setSportFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">All Sports</option>
            <option value="football">⚽ Football</option>
            <option value="cricket">🏏 Cricket</option>
            <option value="badminton">🏸 Badminton</option>
          </select>

          {/* Skill Filter */}
          <select
            value={skillFilter}
            onChange={(e) => setSkillFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="">All Skill Levels</option>
            <option value="beginner">🟢 Beginner</option>
            <option value="intermediate">🟡 Intermediate</option>
            <option value="advanced">🔴 Advanced</option>
            <option value="any">⚪ Any Skill</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="open">🟢 Open Matches</option>
            <option value="active">🟡 Open & Full</option>
            <option value="confirmed">✅ Confirmed</option>
            <option value="cancelled">❌ Cancelled</option>
          </select>
        </div>

        <div className="text-xs font-bold text-slate-400">
          Showing <span className="text-slate-900 font-black">{matches.length}</span> matches
        </div>
      </div>

      {/* Match Cards Grid */}
      {loading ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-3xl">
          <div className="animate-spin text-4xl mb-3">⚽</div>
          <p className="text-xs font-black uppercase text-slate-400 tracking-wider">Loading Available Matches...</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-20 bg-white border border-slate-200 rounded-3xl shadow-sm">
          <div className="text-5xl mb-4 opacity-40">🏟️</div>
          <h3 className="text-lg font-black text-slate-700 uppercase tracking-wide">No Matches Found</h3>
          <p className="text-xs text-slate-500 font-semibold mt-1">Be the first to host a match and invite local players!</p>
          <button
            onClick={openCreateModal}
            className="mt-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wider px-6 py-2.5 rounded-xl text-xs cursor-pointer shadow-md"
          >
            Host a Match Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {matches.map((match) => {
            const isFull = match.current_players >= match.required_players;
            const progressPercent = Math.min(100, Math.round((match.current_players / match.required_players) * 100));

            const isCreator = user && match.creator_id === user.id;
            const hasJoined = user && match.players?.some((p) => p.user_id === user.id && p.status !== 'cancelled');

            const sportIcon = match.sport === 'football' ? '⚽' : match.sport === 'cricket' ? '🏏' : '🏸';

            return (
              <div
                key={match.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col relative group"
              >
                {/* Header Strip */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{sportIcon}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-md">
                        {match.sport}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-md ${
                        match.skill_level === 'beginner' ? 'bg-emerald-100 text-emerald-700' :
                        match.skill_level === 'intermediate' ? 'bg-amber-100 text-amber-700' :
                        match.skill_level === 'advanced' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {match.skill_level}
                      </span>
                    </div>
                    <h3 className="font-black text-slate-900 text-lg leading-snug">{match.title}</h3>
                  </div>

                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
                    match.status === 'open' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' :
                    match.status === 'full' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                    match.status === 'confirmed' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-red-50 border-red-200 text-red-600'
                  }`}>
                    {match.status}
                  </span>
                </div>

                {/* Match Details */}
                <div className="p-6 space-y-4 flex-grow bg-slate-50/40">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold">Turf Location:</span>
                    <span className="font-bold text-slate-900">{match.slot?.turf?.name || 'Bovox Arena'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold">Date & Time:</span>
                    <span className="font-bold text-slate-900">{match.slot?.date} ({match.slot?.start_time} - {match.slot?.end_time})</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold">Host / Creator:</span>
                    <span className="font-bold text-slate-900">{match.creator?.name || 'Player'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-bold">Price per Player:</span>
                    <span className="font-black text-emerald-600 text-sm">₹{match.price_per_player?.toFixed(0)}</span>
                  </div>

                  {/* Player Progress Bar */}
                  <div className="pt-2">
                    <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1.5">
                      <span>Squad Progress</span>
                      <span className="font-black text-slate-900">{match.current_players} / {match.required_players} Players</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          isFull ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="p-4 border-t border-slate-100 bg-white flex gap-2">
                  <button
                    onClick={() => setDetailMatch(match)}
                    className="flex-grow bg-slate-100 hover:bg-slate-200 text-slate-800 font-black uppercase text-[11px] tracking-wider py-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    👥 View Squad
                  </button>

                  {hasJoined ? (
                    <span className="bg-emerald-100 text-emerald-700 font-black uppercase text-[10px] tracking-wider px-4 py-2.5 rounded-xl flex items-center gap-1">
                      ✓ Joined
                    </span>
                  ) : match.status === 'open' && !isFull ? (
                    <button
                      onClick={() => handleJoinMatch(match)}
                      className="flex-grow bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-[11px] tracking-wider py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      ⚽ Join Match
                    </button>
                  ) : (
                    <button
                      disabled
                      className="flex-grow bg-slate-200 text-slate-400 font-black uppercase text-[11px] tracking-wider py-2.5 rounded-xl cursor-not-allowed"
                    >
                      {isFull ? 'Match Full' : 'Closed'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Host Match Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setCreateModalOpen(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
            >
              ✕
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
                <span>⚽</span> Host a Public Match
              </h2>
              <p className="text-xs font-semibold text-slate-500 mt-1">Set requirements and invite players to share turf costs.</p>
            </div>

            <form onSubmit={handleCreateMatch} className="space-y-4">
              {/* Slot Select */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-600 mb-1">Select Available Slot</label>
                {loadingSlots ? (
                  <p className="text-xs font-bold text-slate-400">Loading slots...</p>
                ) : (
                  <select
                    value={formSlotId}
                    onChange={(e) => setFormSlotId(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="">-- Choose a Slot --</option>
                    {availableSlots.map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.date} ({slot.start_time} - {slot.end_time}) — ₹{slot.base_price}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-black uppercase text-slate-600 mb-1">Match Title</label>
                <input
                  type="text"
                  placeholder="e.g. 5v5 Friendly Football Match"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Sport & Skill */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-600 mb-1">Sport</label>
                  <select
                    value={formSport}
                    onChange={(e) => setFormSport(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="football">⚽ Football</option>
                    <option value="cricket">🏏 Cricket</option>
                    <option value="badminton">🏸 Badminton</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-600 mb-1">Skill Level</label>
                  <select
                    value={formSkill}
                    onChange={(e) => setFormSkill(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="any">⚪ Any Skill</option>
                    <option value="beginner">🟢 Beginner</option>
                    <option value="intermediate">🟡 Intermediate</option>
                    <option value="advanced">🔴 Advanced</option>
                  </select>
                </div>
              </div>

              {/* Required Players & Visibility */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase text-slate-600 mb-1">Required Players</label>
                  <input
                    type="number"
                    min="2"
                    max="22"
                    value={formRequiredPlayers}
                    onChange={(e) => setFormRequiredPlayers(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase text-slate-600 mb-1">Visibility</label>
                  <select
                    value={formVisibility}
                    onChange={(e) => setFormVisibility(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="public">🌐 Public (Listed)</option>
                    <option value="private">🔒 Private (Link Only)</option>
                  </select>
                </div>
              </div>

              {/* Calculated Pricing Summary */}
              {selectedSlot && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs space-y-1">
                  <div className="flex justify-between font-bold text-emerald-900">
                    <span>Total Slot Cost:</span>
                    <span>₹{selectedSlot.base_price}</span>
                  </div>
                  <div className="flex justify-between font-black text-emerald-700 text-sm">
                    <span>Your Share (per player):</span>
                    <span>₹{calculatedPrice}</span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submittingCreate}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase tracking-wider py-3.5 rounded-xl transition-all shadow-md active:scale-95 text-xs cursor-pointer"
              >
                {submittingCreate ? 'Creating Match...' : 'Create Match & Pay Host Share'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Squad Details Modal */}
      {detailMatch && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button
              onClick={() => setDetailMatch(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 font-bold text-lg cursor-pointer"
            >
              ✕
            </button>

            <div className="mb-6">
              <span className="text-[10px] font-black uppercase bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md">
                {detailMatch.sport}
              </span>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-2">{detailMatch.title}</h2>
              <p className="text-xs font-semibold text-slate-500">
                {detailMatch.slot?.date} ({detailMatch.slot?.start_time} - {detailMatch.slot?.end_time})
              </p>
            </div>

            {/* Squad List */}
            <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-1">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Joined Players ({detailMatch.players?.length || 0})</h3>
              {detailMatch.players?.map((p) => (
                <div key={p.id} className="flex justify-between items-center bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs font-bold">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 bg-emerald-500/20 text-emerald-700 font-black rounded-full flex items-center justify-center text-xs">
                      {p.user?.name ? p.user.name[0].toUpperCase() : 'P'}
                    </span>
                    <div>
                      <span className="text-slate-900">{p.user?.name || `Player #${p.user_id}`}</span>
                      {p.is_creator && (
                        <span className="ml-2 text-[9px] font-black uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                          Host
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                    p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {user && detailMatch.creator_id === user.id && (
                <button
                  onClick={() => handleCancelMatch(detailMatch.id)}
                  className="w-full bg-red-500 hover:bg-red-600 text-white font-black uppercase text-xs tracking-wider py-3 rounded-xl cursor-pointer"
                >
                  🚫 Cancel Match & Refund All
                </button>
              )}
              {user && detailMatch.players?.some((p) => p.user_id === user.id && !p.is_creator && p.status !== 'cancelled') && (
                <button
                  onClick={() => handleLeaveMatch(detailMatch.id)}
                  className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-black uppercase text-xs tracking-wider py-3 rounded-xl cursor-pointer"
                >
                  🚪 Leave Match
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mock Payment Terminal Modal */}
      {payMatchModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 text-white rounded-3xl max-w-sm w-full p-6 shadow-2xl text-center relative">
            <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
              💳
            </div>
            <h3 className="font-black text-xl mb-1">Match Payment Terminal</h3>
            <p className="text-slate-400 text-xs font-medium mb-4">
              {payMatchModal.isCreator ? 'Complete host registration payment' : 'Pay player share to join match'}
            </p>

            <div className="bg-slate-850 p-4 rounded-2xl mb-6">
              <span className="text-[10px] uppercase font-black text-slate-400 block mb-1">Amount Due</span>
              <span className="text-3xl font-black text-emerald-400">₹{payMatchModal.price?.toFixed(0)}</span>
            </div>

            <button
              onClick={handlePayMockMatch}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-xs tracking-wider py-3.5 rounded-xl shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              Simulate ₹{payMatchModal.price?.toFixed(0)} Payment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
