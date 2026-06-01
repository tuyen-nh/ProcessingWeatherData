# Running the Weather Big-Data Stack on Kubernetes

## 0. One-time install + start cluster
```bash
minikube start --memory=8192 --cpus=4 --driver=docker
kubectl get nodes        # should show 1 node "Ready"
```

## 1. Build the JAR (needs Maven + JDK 8)
```bash
cd BatchLayer_Hadoop && mvn clean package -DskipTests && cd ..
```

## 2. Deploy all infra (ordered, waits for readiness)
```bash
bash k8s/deploy.sh
kubectl get pods -n bigdata -w     # wait until ALL say Running, then Ctrl+C
```

## 3. Load CSVs into HDFS + copy JAR into Spark
```bash
bash k8s/load-and-run.sh
```

## 4. Get the spark-master pod name (used below)
```bash
POD=$(kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}')
```

## 5. Start the Producer (terminal A — leave running)
```bash
kubectl exec -it $POD -n bigdata -- java -cp /opt/spark/app.jar tn.insat.tp3.ApiToKafkaProducer
```

## 6. Start streaming jobs (each in its own terminal)
```bash
# terminal B — Kafka -> HDFS parquet
kubectl exec -it $POD -n bigdata -- /opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 --deploy-mode client \
  --class tn.insat.tp3.KafkaToHDFSDumper /opt/spark/app.jar

# terminal C — Kafka -> AQI -> MongoDB
kubectl exec -it $POD -n bigdata -- /opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 --deploy-mode client \
  --packages org.mongodb.spark:mongo-spark-connector_2.12:3.0.1 \
  --class tn.insat.tp3.StreamingAQI /opt/spark/app.jar
```

## 7. Batch analytics (run after parquet exists in HDFS)
```bash
kubectl exec -it $POD -n bigdata -- /opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 --deploy-mode client \
  --packages org.mongodb.spark:mongo-spark-connector_2.12:3.0.1 \
  --class tn.insat.tp3.BatchWeatherAnalytics /opt/spark/app.jar
```

## 8. Open the web UIs
```bash
minikube service namenode -n bigdata       # HDFS — browse data
minikube service spark-master -n bigdata   # Spark — watch jobs
```

## Debug
```bash
kubectl get pods -n bigdata
kubectl logs <pod> -n bigdata
kubectl describe pod <pod> -n bigdata
kubectl exec -it namenode-0 -n bigdata -- hdfs dfsadmin -report
```

## Reset everything
```bash
kubectl delete namespace bigdata     # deletes all pods + data
```






















































<!-- $env:PATH += ";C:\Program Files\Kubernetes\Minikube"; minikube dashboard  -->
%  đây là câu lệnh để run dashboard trong power shell 
---
---

# Running the Weather Big-Data Stack on Kubernetes (Windows PowerShell)

> ⚠️ All commands below are for **PowerShell** on Windows.
> Keep each terminal open while the job is running.

---

## ✅ Prerequisites (one-time setup)

- Docker Desktop installed and running
- Minikube installed (`winget install Kubernetes.minikube`)
- kubectl installed (`winget install Kubernetes.kubectl`)
- Maven + JDK 8 installed

---

## STEP 0 — Fix PATH (run in every new PowerShell window)

```powershell
$env:PATH += ";C:\Program Files\Kubernetes\Minikube"
```

> This is needed because VS Code terminal doesn't auto-reload PATH after install.

---

## STEP 1 — Start Minikube cluster (one-time or after reboot)

```powershell
minikube start --memory=6144 --cpus=4 --driver=docker
kubectl get nodes    # should show: minikube   Ready
```

---

## STEP 2 — Deploy all infrastructure to Kubernetes

```powershell
kubectl apply -f k8s/00-namespace.yaml
kubectl apply -f k8s/01-hadoop-configmap.yaml
kubectl apply -f k8s/02-zookeeper-statefulset.yaml -f k8s/03-zookeeper-service.yaml
kubectl apply -f k8s/04-namenode-statefulset.yaml  -f k8s/05-namenode-service.yaml
kubectl apply -f k8s/06-datanode-statefulset.yaml  -f k8s/07-datanode-service.yaml
kubectl apply -f k8s/08-kafka-statefulset.yaml     -f k8s/09-kafka-service.yaml
kubectl apply -f k8s/10-spark-master-deployment.yaml -f k8s/11-spark-master-service.yaml
kubectl apply -f k8s/12-spark-worker-deployment.yaml
```

Watch until all pods say `Running`:
```powershell
kubectl get pods -n bigdata -w
# Press Ctrl+C when all show 1/1 Running
```

---

## STEP 3 — Build the JAR

```powershell
cd D:\2025.2\BigData\2026_1_big_data\BatchLayer_Hadoop
mvn clean package -DskipTests
cd ..
```

Output JAR: `BatchLayer_Hadoop/target/batch-layer-hadoop-1.0-SNAPSHOT.jar`

---

## STEP 4 — Load data into HDFS + copy JAR to Spark pod

```powershell
# Upload CSV files to HDFS
kubectl cp vietnam_stations.csv bigdata/namenode-0:/tmp/vietnam_stations.csv
kubectl cp BatchLayer_Hadoop/src/main/resources/export.csv bigdata/namenode-0:/tmp/export.csv
kubectl exec namenode-0 -n bigdata -- hdfs dfs -mkdir -p /user/data/static /user/data/raw/weather_data
kubectl exec namenode-0 -n bigdata -- hdfs dfs -put -f /tmp/vietnam_stations.csv /user/data/static/
kubectl exec namenode-0 -n bigdata -- hdfs dfs -put -f /tmp/export.csv /user/data/raw/weather_data/

# Copy JAR into spark-master pod
$POD = kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}'
kubectl cp "BatchLayer_Hadoop/target/batch-layer-hadoop-1.0-SNAPSHOT.jar" bigdata/${POD}:/opt/spark/app.jar
```

---

## STEP 5 — Get Spark Master pod name (run before steps 6-8)

```powershell
$POD = kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}'
echo $POD
```

---

## STEP 6 — Start Producer (Terminal A — keep running)

```powershell
kubectl exec -it $POD -n bigdata -- java -cp /opt/spark/app.jar tn.insat.tp3.ApiToKafkaProducer
```

---

## STEP 7 — Start Streaming jobs (each in its own terminal)

**Terminal B — Kafka → HDFS (raw data lake):**
```powershell
kubectl exec -it $POD -n bigdata -- /opt/spark/bin/spark-submit `
  --master spark://spark-master:7077 --deploy-mode client `
  --class tn.insat.tp3.KafkaToHDFSDumper /opt/spark/app.jar
```

**Terminal C — Kafka → AQI → MongoDB (speed layer):**
```powershell
kubectl exec -it $POD -n bigdata -- /opt/spark/bin/spark-submit `
  --master spark://spark-master:7077 --deploy-mode client `
  --packages org.mongodb.spark:mongo-spark-connector_2.12:3.0.1 `
  --class tn.insat.tp3.StreamingAQI /opt/spark/app.jar
```

---

## STEP 8 — Batch analytics (run after parquet data exists in HDFS)

```powershell
kubectl exec -it $POD -n bigdata -- /opt/spark/bin/spark-submit `
  --master spark://spark-master:7077 --deploy-mode client `
  --packages org.mongodb.spark:mongo-spark-connector_2.12:3.0.1 `
  --class tn.insat.tp3.BatchWeatherAnalytics /opt/spark/app.jar
```

---

## STEP 9 — Open Visual Dashboard

```powershell
# Keep this terminal open — dashboard stops if you close it
$env:PATH += ";C:\Program Files\Kubernetes\Minikube"
minikube dashboard
# Browser opens automatically → change namespace to "bigdata" → click Pods
```

---

## 🔧 Useful Debug Commands

```powershell
kubectl get pods -n bigdata                          # list all pods
kubectl logs <pod-name> -n bigdata                   # view pod logs
kubectl describe pod <pod-name> -n bigdata           # pod details & errors
kubectl exec -it namenode-0 -n bigdata -- hdfs dfsadmin -report  # HDFS status
```

---

## 🗑️ Reset Everything

```powershell
kubectl delete namespace bigdata    # deletes ALL pods + data
# To redeploy, start again from STEP 2













```
$POD = kubectl get pod -n bigdata -l app=spark-master -o jsonpath='{.items[0].metadata.name}'
kubectl exec -it $POD -n bigdata -- java -cp /opt/spark/app.jar tn.insat.tp3.ApiToKafkaProducer
