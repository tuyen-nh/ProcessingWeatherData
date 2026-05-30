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
