from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "IPL Auction Simulator Backend Running"}