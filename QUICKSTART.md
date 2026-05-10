# Quickstart

1. Open PowerShell as user.
2. Run checks:

```powershell
powershell -File C:\AICommandCenter\scripts\check-system.ps1
```

3. Start dashboard:

```powershell
powershell -File C:\AICommandCenter\scripts\start.ps1
```

4. In the UI:
   - Add a ticket
   - Pick a type
   - Paste repo path + prompt
   - Click `Add ticket`
   - Copy prompt and send to local or browser tool

5. Local-first model scan:

```powershell
powershell -File C:\AICommandCenter\scripts\check-models.ps1
```

6. Optional benchmark:

```powershell
powershell -File C:\AICommandCenter\scripts\benchmark-models.ps1
```

7. Build validation:
   - `npm-safe.ps1 -Script build`
   - `npm-safe.ps1 -Script lint`
