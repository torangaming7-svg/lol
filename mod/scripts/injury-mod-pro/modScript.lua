if setExtensionUnloadMode then
  setExtensionUnloadMode('crashInjuryPro', 'manual')
end
if extensions and extensions.load then
  extensions.load('crashInjuryPro')
elseif load then
  load('crashInjuryPro')
end
