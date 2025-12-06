"""
Agri-Sakha Backend API
A voice-first AI companion for farmers with soil analysis and crop recommendations.
"""

import os
import random
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import google.generativeai as genai

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Agri-Sakha API",
    description="AI-powered agricultural assistant for farmers",
    version="1.0.0"
)

# Enable CORS for all origins (hackathon ease)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


# Pydantic Models
class WeatherResponse(BaseModel):
    rain_mm: float
    flood_risk: bool
    temperature: float = None
    humidity: float = None


class SoilAnalysisResponse(BaseModel):
    soil_type: str


class AdviceRequest(BaseModel):
    soil_type: str
    weather_data: dict
    user_query: str = ""


class AdviceResponse(BaseModel):
    recommendation: str
    crops_suggested: list = []


# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Welcome to Agri-Sakha API! 🌾",
        "endpoints": {
            "/weather": "Get weather data for a location",
            "/analyze-soil": "Analyze soil from uploaded image",
            "/get-advice": "Get AI-powered crop recommendations"
        }
    }


# Endpoint 1: Weather Data from Open-Meteo
@app.get("/weather", response_model=WeatherResponse)
async def get_weather(lat: float, long: float):
    """
    Fetch current weather data from Open-Meteo API.
    Returns rain amount and flood risk assessment.
    """
    try:
        # Open-Meteo API URL (free, no key required)
        url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={long}"
            f"&current=temperature_2m,relative_humidity_2m,rain,precipitation"
            f"&timezone=auto"
        )
        
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=10.0)
            response.raise_for_status()
            data = response.json()
        
        current = data.get("current", {})
        rain_mm = current.get("rain", 0) + current.get("precipitation", 0)
        temperature = current.get("temperature_2m", 0)
        humidity = current.get("relative_humidity_2m", 0)
        
        # Simple flood risk logic: more than 50mm rain indicates risk
        flood_risk = rain_mm > 50
        
        return WeatherResponse(
            rain_mm=round(rain_mm, 2),
            flood_risk=flood_risk,
            temperature=temperature,
            humidity=humidity
        )
        
    except httpx.HTTPError as e:
        raise HTTPException(status_code=503, detail=f"Weather service unavailable: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching weather: {str(e)}")


# Endpoint 2: Soil Analysis using Gemini Vision
@app.post("/analyze-soil", response_model=SoilAnalysisResponse)
async def analyze_soil(image: UploadFile = File(...)):
    """
    Analyze uploaded soil image using Gemini Vision AI.
    Returns the detected soil type based on image analysis.
    """
    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/webp"]
    if image.content_type not in allowed_types:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}"
        )
    
    # Read image data
    image_data = await image.read()
    
    # If Gemini API is not configured, use fallback
    if not GEMINI_API_KEY:
        return SoilAnalysisResponse(soil_type="Loamy Soil")
    
    try:
        import io
        from PIL import Image
        
        # Open image with PIL
        img = Image.open(io.BytesIO(image_data))
        
        # Initialize Gemini Vision model
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Soil classification prompt
        prompt = """You are an expert soil scientist. Analyze this soil image and classify it into ONE of these soil types commonly found in India:

1. Loamy Soil - balanced mixture, dark brown, good texture
2. Clay Soil - heavy, sticky, reddish-brown or grey
3. Sandy Soil - light, loose, pale/yellow color
4. Black Cotton Soil - deep black, cracks when dry
5. Red Soil - reddish color due to iron
6. Alluvial Soil - fertile, light grey to ash grey

Respond with ONLY the soil type name (e.g., "Loamy Soil"). Do not include any explanation."""

        # Generate response with image
        response = model.generate_content([prompt, img])
        
        # Parse response
        soil_type = response.text.strip()
        
        # Validate response is one of expected types
        valid_types = [
            "Loamy Soil", "Clay Soil", "Sandy Soil",
            "Black Cotton Soil", "Red Soil", "Alluvial Soil"
        ]
        
        # Find best match or default
        matched_type = None
        for valid in valid_types:
            if valid.lower() in soil_type.lower():
                matched_type = valid
                break
        
        if not matched_type:
            matched_type = "Loamy Soil"  # Default fallback
        
        return SoilAnalysisResponse(soil_type=matched_type)
        
    except Exception as e:
        print(f"❌ Soil Analysis Error: {type(e).__name__}: {str(e)}")
        # Fallback on error
        return SoilAnalysisResponse(soil_type="Loamy Soil")


# Endpoint 3: AI-Powered Crop Advice using Gemini
@app.post("/get-advice", response_model=AdviceResponse)
async def get_advice(request: AdviceRequest):
    """
    Get AI-powered crop recommendations based on soil type and weather.
    Uses Google Gemini API with Indian Agriculture Expert persona.
    """
    if not GEMINI_API_KEY:
        # Fallback response if API key not configured
        return AdviceResponse(
            recommendation=(
                f"Based on your {request.soil_type} and current weather conditions, "
                f"I recommend growing seasonal crops suitable for your region. "
                f"Please consult local agricultural experts for detailed guidance. "
                f"आपकी मिट्टी के लिए उचित फसलों की सलाह के लिए कृषि विशेषज्ञ से मिलें।"
            ),
            crops_suggested=["Rice", "Wheat", "Vegetables"]
        )
    
    try:
        # System prompt for Indian Agriculture Expert
        system_prompt = """You are "Agri-Sakha", a friendly and knowledgeable Indian Agriculture Expert AI assistant. 
        Your role is to help farmers with crop recommendations based on their soil type and weather conditions.
        
        Guidelines:
        1. Give practical, actionable advice suitable for Indian farmers
        2. Consider the soil type and current weather data provided
        3. Suggest 2-3 specific crops that would grow well
        4. Include both English and Hindi in your response for accessibility
        5. Keep the response short, friendly, and easy to understand (max 150 words)
        6. Mention any precautions based on weather (flooding, drought, etc.)
        7. Be encouraging and supportive in your tone
        
        Format your response naturally, mixing English and Hindi as an Indian agriculture expert would speak."""

        # Prepare the user message
        weather_info = request.weather_data
        rain = weather_info.get('rain_mm', 0)
        flood_risk = weather_info.get('flood_risk', False)
        temp = weather_info.get('temperature', 'N/A')
        humidity = weather_info.get('humidity', 'N/A')
        
        user_message = f"""
        Farmer's Query: {request.user_query if request.user_query else 'What crops should I grow?'}
        
        Soil Analysis Result: {request.soil_type}
        
        Current Weather Data:
        - Temperature: {temp}°C
        - Rainfall: {rain} mm
        - Humidity: {humidity}%
        - Flood Risk: {'Yes - High rainfall detected!' if flood_risk else 'No'}
        
        Please provide crop recommendations based on this information.
        """

        # Initialize Gemini model (using 2.0-flash as 1.5 is deprecated)
        model = genai.GenerativeModel('gemini-2.0-flash')
        
        # Generate response
        response = model.generate_content(
            f"{system_prompt}\n\n{user_message}",
            generation_config=genai.types.GenerationConfig(
                max_output_tokens=300,
                temperature=0.7,
            )
        )
        
        recommendation_text = response.text
        
        # Extract suggested crops (simple parsing)
        crops = []
        common_crops = [
            "Rice", "Wheat", "Maize", "Sugarcane", "Cotton", "Soybean",
            "Groundnut", "Pulses", "Vegetables", "Potato", "Tomato",
            "Onion", "Mustard", "Jowar", "Bajra", "Paddy", "Chana"
        ]
        for crop in common_crops:
            if crop.lower() in recommendation_text.lower():
                crops.append(crop)
        
        return AdviceResponse(
            recommendation=recommendation_text,
            crops_suggested=crops[:5] if crops else ["Seasonal Crops"]
        )
        
    except Exception as e:
        # Log the actual error for debugging
        print(f"❌ Gemini API Error: {type(e).__name__}: {str(e)}")
        # Graceful fallback on error
        return AdviceResponse(
            recommendation=(
                f"Namaste! 🙏 For your {request.soil_type}, considering the current weather, "
                f"I suggest growing crops that suit your soil. "
                f"आपकी {request.soil_type} मिट्टी के लिए मौसम के अनुसार उचित फसलें उगाएं। "
                f"(AI service temporarily unavailable, please try again)"
            ),
            crops_suggested=["Rice", "Wheat", "Vegetables"]
        )


# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "gemini_configured": GEMINI_API_KEY is not None
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
