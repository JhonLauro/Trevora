@echo off
setlocal

set "MAVEN_PROJECTBASEDIR=%~dp0"
set "MAVEN_PROJECTBASEDIR_SAFE=%~dp0."
set "MAVEN_WRAPPER_JAR=%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.jar"
set "CACHED_MAVEN_CMD=%USERPROFILE%\.m2\wrapper\dists\apache-maven-3.9.12-bin\5nmfsn99br87k5d4ajlekdq10k\apache-maven-3.9.12\bin\mvn.cmd"

if not exist "%MAVEN_WRAPPER_JAR%" (
  echo Maven wrapper jar not found: %MAVEN_WRAPPER_JAR%
  exit /b 1
)

if exist "%USERPROFILE%\.jdks\openjdk-23.0.1\bin\java.exe" (
  set "JAVA_HOME=%USERPROFILE%\.jdks\openjdk-23.0.1"
)

if defined JAVA_HOME (
  set "JAVA_EXE=%JAVA_HOME%\bin\java.exe"
  set "PATH=%JAVA_HOME%\bin;%PATH%"
) else (
  set "JAVA_EXE=java.exe"
)

set "MAVEN_OPTS=-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT %MAVEN_OPTS%"

if exist "%CACHED_MAVEN_CMD%" (
  call "%CACHED_MAVEN_CMD%" %*
  exit /b %ERRORLEVEL%
)

"%JAVA_EXE%" "-Djavax.net.ssl.trustStoreType=WINDOWS-ROOT" "-Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR_SAFE%" -classpath "%MAVEN_WRAPPER_JAR%" org.apache.maven.wrapper.MavenWrapperMain %*
exit /b %ERRORLEVEL%
endlocal
