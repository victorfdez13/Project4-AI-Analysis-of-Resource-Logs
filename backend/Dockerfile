# syntax=docker/dockerfile:1

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY Project4-AI-Analysis-of-Resource-Logs.csproj ./
RUN dotnet restore Project4-AI-Analysis-of-Resource-Logs.csproj

COPY . ./
RUN dotnet publish Project4-AI-Analysis-of-Resource-Logs.csproj \
    -c Release \
    -o /app/publish \
    --no-restore \
    /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish ./

ENV ASPNETCORE_URLS=http://+:5005
EXPOSE 5005

ENTRYPOINT ["dotnet", "Project4-AI-Analysis-of-Resource-Logs.dll"]
