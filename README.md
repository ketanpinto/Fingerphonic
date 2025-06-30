# Here are your Instructions


cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install fastapi uvicorn pymongo motor python-dotenv
uvicorn server:app --reload --host 0.0.0.0 --port 8001


cd frontend
npm install  # or yarn install
npm start    # or yarn start
