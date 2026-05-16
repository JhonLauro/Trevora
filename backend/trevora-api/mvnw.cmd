@echo off
setlocal

set MAVEN_PROJECTBASEDIR=%~dp0
set MAVEN_WRAPPER_JAR=%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.jar

if not exist "%MAVEN_WRAPPER_JAR%" (
  echo Maven wrapper jar not found: %MAVEN_WRAPPER_JAR%
  exit /b 1
)

if defined JAVA_HOME (
  set JAVA_EXE=%JAVA_HOME%\bin\java.exe
) else (
  set JAVA_EXE=java.exe
)

"%JAVA_EXE%" -Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR% -classpath "%MAVEN_WRAPPER_JAR%" org.apache.maven.wrapper.MavenWrapperMain %*
exit /b %ERRORLEVEL%
endlocal
