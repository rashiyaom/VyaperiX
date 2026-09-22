redis api secret : A455sijdqecd5fo8ymnw1rwwgxzqa7cp6n3dc9jdw7fn0hhkrc5 
groq api key : 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


cd backend
uvicorn main:app --reload --port 8000


cd frontend
npm run dev


Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
