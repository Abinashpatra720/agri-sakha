import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

// Backend API URL - uses environment variable in production, localhost in development
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function App() {
  // State management
  const [voiceQuery, setVoiceQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isListening, setIsListening] = useState(false);

  // Location state
  const [location, setLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState('detecting');
  const [locationName, setLocationName] = useState('');

  // Reverse geocoding function
  const getLocationName = async (lat, long) => {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${long}&zoom=10`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const address = response.data.address;
      // Get city, district, or state name
      const name = address.city || address.town || address.village ||
        address.district || address.county || address.state || 'Unknown Location';
      setLocationName(name);
    } catch (err) {
      console.error('Reverse geocoding error:', err);
      setLocationName('');
    }
  };

  // Get user's location on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            long: position.coords.longitude
          };
          setLocation(coords);
          setLocationStatus('detected');
          getLocationName(coords.lat, coords.long);
        },
        (err) => {
          console.error('Geolocation error:', err);
          setLocationStatus('error');
          // Fallback to Bihar coordinates
          setLocation({ lat: 25.5941, long: 85.1376 });
          setLocationName('Patna, Bihar');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
      );
    } else {
      setLocationStatus('unsupported');
      // Fallback to Bihar coordinates
      setLocation({ lat: 25.5941, long: 85.1376 });
      setLocationName('Patna, Bihar');
    }
  }, []);

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
    }
  };

  // Handle voice recording (Web Speech API)
  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Voice recognition not supported in this browser. Please use Chrome.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'en-IN'; // Indian English
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setVoiceQuery(transcript);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      setError('Voice recognition error: ' + event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  // Main submit handler
  const handleSubmit = async () => {
    if (!selectedFile) {
      setError('Please upload a soil photo first!');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      // Step 1: Analyze soil
      const formData = new FormData();
      formData.append('image', selectedFile);

      const soilResponse = await axios.post(`${API_URL}/analyze-soil`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const soilData = soilResponse.data;

      // Step 2: Get weather data (using detected location)
      const weatherResponse = await axios.get(`${API_URL}/weather`, {
        params: { lat: location.lat, long: location.long }
      });

      const weatherData = weatherResponse.data;

      // Step 3: Get AI advice
      const adviceResponse = await axios.post(`${API_URL}/get-advice`, {
        soil_type: soilData.soil_type,
        weather_data: weatherData,
        user_query: voiceQuery || 'What crops should I grow?'
      });

      setResult({
        soil: soilData,
        weather: weatherData,
        advice: adviceResponse.data
      });

    } catch (err) {
      console.error('Error:', err);
      setError(
        err.response?.data?.detail ||
        'Something went wrong. Please check if the backend is running.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setVoiceQuery('');
    setSelectedFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-agri-400 to-agri-600 rounded-full mb-4 shadow-lg shadow-agri-500/30">
            <span className="text-4xl">🌾</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 text-shadow-glow">
            Agri-Sakha
          </h1>
          <p className="text-agri-200 text-lg">
            आपका कृषि मित्र • Your Farming Companion
          </p>

          {/* Location Badge */}
          <div className="mt-4 inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20">
            <span className="text-lg">📍</span>
            {locationStatus === 'detecting' ? (
              <span className="text-white/70 text-sm animate-pulse">Detecting location...</span>
            ) : locationName ? (
              <span className="text-white font-medium">{locationName}</span>
            ) : location ? (
              <span className="text-white/70 text-sm">{location.lat.toFixed(2)}°N, {location.long.toFixed(2)}°E</span>
            ) : (
              <span className="text-white/70 text-sm">Location unavailable</span>
            )}
          </div>
        </div>

        {/* Main Card */}
        <div className="glass-card p-6 md:p-8 space-y-6">

          {/* Voice Input Section */}
          <div className="space-y-3">
            <label className="block text-white/80 text-sm font-medium">
              🎤 Ask your question (पूछें अपना सवाल)
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={voiceQuery}
                onChange={(e) => setVoiceQuery(e.target.value)}
                placeholder="e.g., What crops should I grow?"
                className="input-field flex-1"
              />
              <button
                onClick={handleVoiceInput}
                disabled={isListening}
                className={`px-4 rounded-xl transition-all duration-300 ${isListening
                  ? 'bg-red-500 animate-pulse'
                  : 'bg-white/20 hover:bg-white/30'
                  }`}
                title="Click to speak"
              >
                <span className="text-2xl">{isListening ? '🔴' : '🎙️'}</span>
              </button>
            </div>
            {isListening && (
              <p className="text-agri-300 text-sm animate-pulse">
                🎧 Listening... Speak now!
              </p>
            )}
          </div>

          {/* File Upload Section */}
          <div className="space-y-3">
            <label className="block text-white/80 text-sm font-medium">
              📷 Upload Soil Photo (मिट्टी की फोटो)
            </label>
            <label className="file-input-label">
              {previewUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={previewUrl}
                    alt="Soil preview"
                    className="w-full h-full object-cover rounded-xl"
                  />
                  <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm">Click to change</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="text-4xl mb-2">📤</span>
                  <span className="text-white/60 text-sm">
                    Click or drag to upload
                  </span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {selectedFile && (
              <p className="text-agri-300 text-sm">
                ✅ Selected: {selectedFile.name}
              </p>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 text-red-200">
              ⚠️ {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={isLoading || !selectedFile}
            className="btn-primary w-full text-lg"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Analyzing... विश्लेषण हो रहा है
              </span>
            ) : (
              '🌱 Ask Agri-Sakha • पूछें'
            )}
          </button>
        </div>

        {/* Results Section */}
        {result && (
          <div className="mt-6 space-y-4 animate-fadeIn">
            {/* Analysis Summary */}
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                📊 Analysis Results • विश्लेषण परिणाम
              </h2>

              {/* Soil Type Card */}
              <div className="bg-soil-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🌍</span>
                  <div>
                    <p className="text-white/60 text-sm">Soil Type (मिट्टी का प्रकार)</p>
                    <p className="text-white font-semibold text-lg">{result.soil.soil_type}</p>
                  </div>
                </div>
              </div>

              {/* Weather Card */}
              <div className="bg-blue-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🌤️</span>
                    <div>
                      <p className="text-white/60 text-sm">Current Weather (मौसम)</p>
                      <p className="text-white">
                        {result.weather.temperature}°C • Rain: {result.weather.rain_mm}mm
                      </p>
                    </div>
                  </div>
                  {result.weather.flood_risk && (
                    <div className="bg-red-500/30 px-3 py-1 rounded-full">
                      <span className="text-red-200 text-sm">⚠️ Flood Risk</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Suggested Crops */}
              {result.advice.crops_suggested && result.advice.crops_suggested.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {result.advice.crops_suggested.map((crop, i) => (
                    <span
                      key={i}
                      className="bg-agri-600/40 text-agri-100 px-3 py-1 rounded-full text-sm"
                    >
                      🌿 {crop}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* AI Recommendation */}
            <div className="glass-card p-6">
              <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                🤖 AI Recommendation • सुझाव
              </h2>
              <div className="bg-white/5 rounded-xl p-4 text-white/90 leading-relaxed whitespace-pre-wrap">
                {result.advice.recommendation}
              </div>
            </div>

            {/* Reset Button */}
            <button
              onClick={handleReset}
              className="w-full py-3 text-white/60 hover:text-white transition-colors"
            >
              🔄 Start New Analysis • नया विश्लेषण
            </button>
          </div>
        )}

        {/* Footer with Location Status */}
        <div className="text-center mt-8 text-white/40 text-sm">
          <p>Made with 💚 for Indian Farmers</p>
          <p className="text-xs mt-1">
            {locationStatus === 'detecting' && '📍 Detecting location...'}
            {locationStatus === 'detected' && location && (
              <span>📍 Location: {location.lat.toFixed(4)}°N, {location.long.toFixed(4)}°E</span>
            )}
            {locationStatus === 'error' && '📍 Using default location (Bihar)'}
            {locationStatus === 'unsupported' && '📍 Geolocation not supported'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
