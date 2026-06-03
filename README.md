# Bukmacher AI

Aplikacja (PWA) na telefon, która szacuje szanse na wynik pojedynku sportowego
(piłka nożna, koszykówka, tenis, MMA i inne) na podstawie aktualnych danych
znalezionych w internecie przez agenta Claude (web search).

> Aplikacja rozrywkowa. Prognozy są szacunkowe i nie stanowią porady hazardowej.

## Jak to działa

- Wpisujesz dwie drużyny lub dwóch zawodników + dyscyplinę.
- Agent Claude wyszukuje w sieci formę, historię pojedynków, kontuzje itd.
- Dostajesz prawdopodobieństwa wyników, sugerowany typ i kluczowe czynniki.
- Wszystko działa na telefonie — bez własnego serwera. Klucz API jest
  przechowywany tylko na telefonie (localStorage).

## Praca na komputerze (rozwój)

```bash
npm install        # raz, instalacja zależności
npm run icons      # wygenerowanie ikon PWA (raz / po zmianie)
npm run dev        # podgląd lokalny
npm run build      # build produkcyjny do folderu dist/
```

## Publikacja i auto-aktualizacja na telefonie

Aplikacja jest publikowana na **GitHub Pages**. Po każdym `git push` na gałąź
`main` GitHub Actions automatycznie zbuduje i opublikuje nową wersję, a telefon
sam pobierze aktualizację (Service Worker, tryb `autoUpdate`).

### Konfiguracja jednorazowa

1. Utwórz repozytorium na GitHub o nazwie **Bukmacher** (taka sama jak `base`
   w `vite.config.ts`; jeśli inna — zmień tam wartość `BASE`).
2. Wypchnij kod:
   ```bash
   git init
   git add .
   git commit -m "Bukmacher AI"
   git branch -M main
   git remote add origin https://github.com/<twoj-login>/Bukmacher.git
   git push -u origin main
   ```
3. W repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Po zakończeniu akcji aplikacja będzie pod adresem:
   `https://<twoj-login>.github.io/Bukmacher/`

### Instalacja na Androidzie

1. Otwórz adres w Chrome na telefonie.
2. Menu (⋮) → **Dodaj do ekranu głównego** / **Zainstaluj aplikację**.
3. Otwórz appkę z ekranu głównego, wejdź w ⚙️ i wklej klucz API.

## Klucz API

Token pobierzesz z `console.anthropic.com` → **Settings → API Keys**.
Wklej go w aplikacji (⚙️ Konfiguracja). Każda analiza zużywa tokeny API
(model + wyszukiwanie w sieci).

### Opcjonalnie: API-Football (tylko piłka nożna)

W ⚙️ Konfiguracji można dodać darmowy klucz **API-Football** z
`dashboard.api-football.com` (api-sports — **NIE** RapidAPI). Dla meczów piłki
nożnej aplikacja pobierze wtedy zweryfikowane dane (forma, H2H, kartki, średnie
goli) bezpośrednio z przeglądarki (endpoint `v3.football.api-sports.io` udostępnia
CORS, więc nie potrzeba serwera) i przekaże je agentowi jako fakty o wysokim
priorytecie. Każdy użytkownik podaje własny klucz — jest trzymany tylko lokalnie.
Darmowy plan: 100 zapytań/dobę (jedna analiza to ~5–7 zapytań). Puste pole =
korzystamy wyłącznie z web search.
