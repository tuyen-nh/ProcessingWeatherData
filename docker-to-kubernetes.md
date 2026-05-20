# Migrating Docker Compose → Kubernetes (Step-by-Step)

> **Stack**: HDFS (1 NameNode + 3 DataNodes) + Kafka (3 Brokers + Zookeeper) + Spark (1 Master + 2 Workers)

---

## 📋 Prerequisites

Before starting, install the following tools:

```bash
# 1. kubectl — Kubernetes CLI
# Download from: https://kubernetes.io/docs/tasks/tools/install-kubectl-windows/

# 2. Minikube — run K8s locally (for development/testing)
choco install minikube

# 3. kompose — auto-convert docker-compose to K8s YAML (optional helper)
choco install kompose

# Verify installations
kubectl version --client
minikube version
kompose version
```

Start your local cluster:

```bash
minikube start --memory=8192 --cpus=4
```

---

## 📁 Target Directory Structure

Create a `k8s/` folder in your project root:

```
2026_1_big_data/
├── docker-compose.yml          ← original
├── hadoop.env                  ← will become ConfigMap
└── k8s/
    ├── 00-namespace.yaml
    ├── 01-hadoop-configmap.yaml
    ├── 02-zookeeper-statefulset.yaml
    ├── 03-zookeeper-service.yaml
    ├── 04-namenode-statefulset.yaml
    ├── 05-namenode-service.yaml
    ├── 06-datanode-statefulset.yaml
    ├── 07-datanode-service.yaml
    ├── 08-kafka-statefulset.yaml
    ├── 09-kafka-service.yaml
    ├── 10-spark-master-deployment.yaml
    ├── 11-spark-master-service.yaml
    └── 12-spark-worker-deployment.yaml
```

---

## STEP 1 — Create Namespace

> Namespace groups all your services together, like a Docker network.

**File: `k8s/00-namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: bigdata
```

```bash
kubectl apply -f k8s/00-namespace.yaml
```

---

## STEP 2 — Convert `hadoop.env` → ConfigMap

> `env_file: ./hadoop.env` in Docker Compose becomes a `ConfigMap` in Kubernetes.

**File: `k8s/01-hadoop-configmap.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: hadoop-env
  namespace: bigdata
data:
  CORE_CONF_fs_defaultFS: "hdfs://namenode:9000"
  CORE_CONF_hadoop_http_staticuser_user: "root"
  CORE_CONF_hadoop_proxyuser_hue_hosts: "*"
  CORE_CONF_hadoop_proxyuser_hue_groups: "*"
  CORE_CONF_io_compression_codecs: "org.apache.hadoop.io.compress.SnappyCodec"
  HDFS_CONF_dfs_webhdfs_enabled: "true"
  HDFS_CONF_dfs_permissions_enabled: "false"
  HDFS_CONF_dfs_namenode_datanode_registration_ip___hostname___check: "false"
  YARN_CONF_yarn_log___aggregation___enable: "true"
  YARN_CONF_yarn_resourcemanager_recovery_enabled: "true"
  YARN_CONF_yarn_resourcemanager_store_class: "org.apache.hadoop.yarn.server.resourcemanager.recovery.FileSystemRMStateStore"
  YARN_CONF_yarn_resourcemanager_fs_state___store_uri: "/rmstate"
  YARN_CONF_yarn_nodemanager_remote_app_log_dir: "/app-logs"
  YARN_CONF_yarn_log_server_url: "http://historyserver:8188/applicationhistory/logs/"
  YARN_CONF_yarn_timeline_service_enabled: "true"
  YARN_CONF_yarn_timeline_service_generic_application_history_enabled: "true"
  YARN_CONF_yarn_resourcemanager_system_metrics_publisher_enabled: "true"
```

```bash
kubectl apply -f k8s/01-hadoop-configmap.yaml
```

---

## STEP 3 — Deploy Zookeeper

> Docker Compose service: `zookeeper`
> In K8s: `StatefulSet` (stateful, needs stable pod name) + 2 `Services` (headless + ClusterIP)

**File: `k8s/02-zookeeper-statefulset.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: zookeeper
  namespace: bigdata
spec:
  serviceName: zookeeper-headless
  replicas: 1
  selector:
    matchLabels:
      app: zookeeper
  template:
    metadata:
      labels:
        app: zookeeper
    spec:
      containers:
        - name: zookeeper
          image: confluentinc/cp-zookeeper:latest
          ports:
            - containerPort: 2181
          env:
            - name: ZOOKEEPER_CLIENT_PORT
              value: "2181"
            - name: ZOOKEEPER_TICK_TIME
              value: "2000"
          volumeMounts:
            - name: zookeeper-data
              mountPath: /var/lib/zookeeper/data
            - name: zookeeper-log
              mountPath: /var/lib/zookeeper/log
  volumeClaimTemplates:
    - metadata:
        name: zookeeper-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
    - metadata:
        name: zookeeper-log
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
```

**File: `k8s/03-zookeeper-service.yaml`**

```yaml
# Headless service — allows Kafka pods to discover Zookeeper by DNS
apiVersion: v1
kind: Service
metadata:
  name: zookeeper-headless
  namespace: bigdata
spec:
  clusterIP: None
  selector:
    app: zookeeper
  ports:
    - port: 2181
      name: client
---
# ClusterIP service — standard internal access
apiVersion: v1
kind: Service
metadata:
  name: zookeeper
  namespace: bigdata
spec:
  selector:
    app: zookeeper
  ports:
    - port: 2181
      name: client
```

```bash
kubectl apply -f k8s/02-zookeeper-statefulset.yaml
kubectl apply -f k8s/03-zookeeper-service.yaml

# Wait for it to be ready before continuing
kubectl wait --for=condition=ready pod/zookeeper-0 -n bigdata --timeout=120s
```

---

## STEP 4 — Deploy HDFS NameNode

> Docker Compose service: `namenode`
> Key change: `volumes:` → `volumeClaimTemplates`, `env_file` → `envFrom configMapRef`

**File: `k8s/04-namenode-statefulset.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: namenode
  namespace: bigdata
spec:
  serviceName: namenode
  replicas: 1
  selector:
    matchLabels:
      app: namenode
  template:
    metadata:
      labels:
        app: namenode
    spec:
      containers:
        - name: namenode
          image: bde2020/hadoop-namenode:2.0.0-hadoop3.2.1-java8
          ports:
            - containerPort: 9870
              name: web
            - containerPort: 9000
              name: rpc
          env:
            - name: CLUSTER_NAME
              value: "test"
          envFrom:
            - configMapRef:
                name: hadoop-env
          readinessProbe:
            httpGet:
              path: /
              port: 9870
            initialDelaySeconds: 30
            periodSeconds: 10
          volumeMounts:
            - name: namenode-data
              mountPath: /hadoop/dfs/name
  volumeClaimTemplates:
    - metadata:
        name: namenode-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
```

**File: `k8s/05-namenode-service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: namenode
  namespace: bigdata
spec:
  selector:
    app: namenode
  type: NodePort        # NodePort = accessible from outside the cluster
  ports:
    - name: web
      port: 9870
      targetPort: 9870
      nodePort: 30870   # Access via: http://localhost:30870
    - name: rpc
      port: 9000
      targetPort: 9000
```

```bash
kubectl apply -f k8s/04-namenode-statefulset.yaml
kubectl apply -f k8s/05-namenode-service.yaml

# Wait for NameNode to be ready before starting DataNodes
kubectl wait --for=condition=ready pod/namenode-0 -n bigdata --timeout=180s
```

---

## STEP 5 — Deploy HDFS DataNodes

> Docker Compose services: `datanode`, `datanode1`, `datanode2`
> Key change: Replace `SERVICE_PRECONDITION: "namenode:9870"` with an `initContainer` that waits for NameNode.
> Use `replicas: 3` instead of 3 separate services.

**File: `k8s/06-datanode-statefulset.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: datanode
  namespace: bigdata
spec:
  serviceName: datanode-headless
  replicas: 3        # replaces datanode, datanode1, datanode2
  selector:
    matchLabels:
      app: datanode
  template:
    metadata:
      labels:
        app: datanode
    spec:
      # initContainer replaces SERVICE_PRECONDITION
      initContainers:
        - name: wait-for-namenode
          image: busybox
          command: ['sh', '-c', 'until wget -q -O- http://namenode:9870; do echo waiting for namenode; sleep 5; done']
      containers:
        - name: datanode
          image: bde2020/hadoop-datanode:2.0.0-hadoop3.2.1-java8
          ports:
            - containerPort: 9866
              name: data
          envFrom:
            - configMapRef:
                name: hadoop-env
          volumeMounts:
            - name: datanode-data
              mountPath: /hadoop/dfs/data
  volumeClaimTemplates:
    - metadata:
        name: datanode-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
```

**File: `k8s/07-datanode-service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: datanode-headless
  namespace: bigdata
spec:
  clusterIP: None    # headless — each pod gets its own DNS: datanode-0, datanode-1, datanode-2
  selector:
    app: datanode
  ports:
    - port: 9866
      name: data
```

```bash
kubectl apply -f k8s/06-datanode-statefulset.yaml
kubectl apply -f k8s/07-datanode-service.yaml
```

---

## STEP 6 — Deploy Kafka Cluster (3 Brokers)

> Docker Compose services: `kafka1`, `kafka2`, `kafka3`
> Key change: `KAFKA_ADVERTISED_LISTENERS` must use pod DNS names, not `localhost`.
> Use `replicas: 3` + `StatefulSet` so each pod gets a stable name: `kafka-0`, `kafka-1`, `kafka-2`.

**File: `k8s/08-kafka-statefulset.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: kafka
  namespace: bigdata
spec:
  serviceName: kafka-headless
  replicas: 3
  selector:
    matchLabels:
      app: kafka
  template:
    metadata:
      labels:
        app: kafka
    spec:
      initContainers:
        - name: wait-for-zookeeper
          image: busybox
          command: ['sh', '-c', 'until nc -z zookeeper 2181; do echo waiting for zookeeper; sleep 3; done']
      containers:
        - name: kafka
          image: confluentinc/cp-kafka:7.4.0
          ports:
            - containerPort: 29092
              name: internal
            - containerPort: 9092
              name: external
          env:
            # BROKER_ID is set dynamically from pod ordinal (0, 1, 2)
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
            - name: KAFKA_ZOOKEEPER_CONNECT
              value: "zookeeper:2181"
            - name: KAFKA_LISTENER_SECURITY_PROTOCOL_MAP
              value: "PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT"
            - name: KAFKA_INTER_BROKER_LISTENER_NAME
              value: "PLAINTEXT"
            - name: KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
              value: "1"
            - name: KAFKA_NUM_PARTITIONS
              value: "3"
            - name: KAFKA_DEFAULT_REPLICATION_FACTOR
              value: "2"
          # Use a startup script to compute BROKER_ID and ADVERTISED_LISTENERS from pod name
          command:
            - sh
            - -c
            - |
              export BROKER_ID=${HOSTNAME##*-}
              export KAFKA_BROKER_ID=$BROKER_ID
              export KAFKA_ADVERTISED_LISTENERS="PLAINTEXT://${HOSTNAME}.kafka-headless.bigdata.svc.cluster.local:29092,PLAINTEXT_HOST://${HOSTNAME}.kafka-headless.bigdata.svc.cluster.local:9092"
              exec /etc/confluent/docker/run
          volumeMounts:
            - name: kafka-data
              mountPath: /var/lib/kafka/data
  volumeClaimTemplates:
    - metadata:
        name: kafka-data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 5Gi
```

**File: `k8s/09-kafka-service.yaml`**

```yaml
# Headless service — each broker gets its own DNS
# kafka-0.kafka-headless.bigdata.svc.cluster.local
# kafka-1.kafka-headless.bigdata.svc.cluster.local
# kafka-2.kafka-headless.bigdata.svc.cluster.local
apiVersion: v1
kind: Service
metadata:
  name: kafka-headless
  namespace: bigdata
spec:
  clusterIP: None
  selector:
    app: kafka
  ports:
    - port: 29092
      name: internal
    - port: 9092
      name: external
---
# ClusterIP service — for external tools to connect via bootstrap
apiVersion: v1
kind: Service
metadata:
  name: kafka
  namespace: bigdata
spec:
  selector:
    app: kafka
  type: NodePort
  ports:
    - name: broker
      port: 9092
      targetPort: 9092
      nodePort: 30092
```

```bash
kubectl apply -f k8s/08-kafka-statefulset.yaml
kubectl apply -f k8s/09-kafka-service.yaml
```

> **⚠️ Update your Java application**: Change the Kafka bootstrap servers from `localhost:9092` to:
> ```
> kafka-0.kafka-headless.bigdata.svc.cluster.local:9092,
> kafka-1.kafka-headless.bigdata.svc.cluster.local:9092,
> kafka-2.kafka-headless.bigdata.svc.cluster.local:9092
> ```

---

## STEP 7 — Deploy Spark Master

> Docker Compose service: `spark-master`
> Spark is **stateless** → use `Deployment` (not StatefulSet).

**File: `k8s/10-spark-master-deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spark-master
  namespace: bigdata
spec:
  replicas: 1
  selector:
    matchLabels:
      app: spark-master
  template:
    metadata:
      labels:
        app: spark-master
    spec:
      containers:
        - name: spark-master
          image: spark:3.5.8-scala2.12-java11-ubuntu
          command:
            - /opt/spark/bin/spark-class
            - org.apache.spark.deploy.master.Master
          env:
            - name: SPARK_MASTER_HOST
              value: "spark-master"
          ports:
            - containerPort: 8080
              name: webui
            - containerPort: 7077
              name: rpc
          readinessProbe:
            httpGet:
              path: /
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 10
```

**File: `k8s/11-spark-master-service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: spark-master
  namespace: bigdata
spec:
  selector:
    app: spark-master
  type: NodePort
  ports:
    - name: webui
      port: 8080
      targetPort: 8080
      nodePort: 30808   # Access Spark UI at: http://localhost:30808
    - name: rpc
      port: 7077
      targetPort: 7077
```

```bash
kubectl apply -f k8s/10-spark-master-deployment.yaml
kubectl apply -f k8s/11-spark-master-service.yaml

# Wait for Spark master
kubectl wait --for=condition=ready pod -l app=spark-master -n bigdata --timeout=120s
```

---

## STEP 8 — Deploy Spark Workers

> Docker Compose services: `spark-worker-1`, `spark-worker-2`
> Use `replicas: 2` instead of 2 separate services.

**File: `k8s/12-spark-worker-deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spark-worker
  namespace: bigdata
spec:
  replicas: 2          # replaces spark-worker-1 and spark-worker-2
  selector:
    matchLabels:
      app: spark-worker
  template:
    metadata:
      labels:
        app: spark-worker
    spec:
      initContainers:
        - name: wait-for-spark-master
          image: busybox
          command: ['sh', '-c', 'until nc -z spark-master 7077; do echo waiting for spark-master; sleep 3; done']
      containers:
        - name: spark-worker
          image: spark:3.5.8-scala2.12-java11-ubuntu
          command:
            - /opt/spark/bin/spark-class
            - org.apache.spark.deploy.worker.Worker
            - spark://spark-master:7077
          resources:
            requests:
              memory: "1Gi"
              cpu: "500m"
            limits:
              memory: "2Gi"
              cpu: "1"
```

```bash
kubectl apply -f k8s/12-spark-worker-deployment.yaml
```

---

## STEP 9 — Apply Everything at Once

After creating all files, you can deploy everything in one command:

```bash
# Apply in order (namespace first, then configs, then services)
kubectl apply -f k8s/ --namespace=bigdata

# Check all pods status
kubectl get pods -n bigdata

# Watch pods starting up
kubectl get pods -n bigdata -w
```

Expected output when healthy:

```
NAME              READY   STATUS    RESTARTS   AGE
namenode-0        1/1     Running   0          3m
datanode-0        1/1     Running   0          2m
datanode-1        1/1     Running   0          2m
datanode-2        1/1     Running   0          2m
zookeeper-0       1/1     Running   0          4m
kafka-0           1/1     Running   0          3m
kafka-1           1/1     Running   0          3m
kafka-2           1/1     Running   0          3m
spark-master-xxx  1/1     Running   0          2m
spark-worker-xxx  1/1     Running   0          1m
spark-worker-yyy  1/1     Running   0          1m
```

---

## STEP 10 — Access the Web UIs

```bash
# Get the minikube IP
minikube ip
# Example output: 192.168.49.2
```

| Service | URL |
|---|---|
| **HDFS NameNode Web UI** | `http://<minikube-ip>:30870` |
| **Spark Master Web UI** | `http://<minikube-ip>:30808` |
| **Kafka Bootstrap** | `<minikube-ip>:30092` |

Or use minikube's built-in tunnel:

```bash
minikube service spark-master -n bigdata
minikube service namenode -n bigdata
```

---

## STEP 11 — Submitting Spark Jobs

> Replace `spark://localhost:7077` or `spark://spark-master:7077` with the K8s service address.

```bash
# From inside the spark-master pod
kubectl exec -it deploy/spark-master -n bigdata -- bash

# Then run spark-submit
/opt/spark/bin/spark-submit \
  --master spark://spark-master:7077 \
  --deploy-mode client \
  --class tn.insat.tp3.KafkaToHDFSDumper \
  /path/to/your.jar
```

---

## 🔧 Useful Debugging Commands

```bash
# View logs of a pod
kubectl logs namenode-0 -n bigdata
kubectl logs kafka-0 -n bigdata

# Describe a pod (shows events, errors)
kubectl describe pod namenode-0 -n bigdata

# Execute a shell inside a pod
kubectl exec -it namenode-0 -n bigdata -- bash

# Check HDFS health from inside the namenode pod
kubectl exec -it namenode-0 -n bigdata -- hdfs dfsadmin -report

# Delete everything and start over
kubectl delete namespace bigdata
```

---

## 📋 Docker Compose vs Kubernetes Cheatsheet

| Docker Compose Concept | Kubernetes Equivalent |
|---|---|
| `services:` | `Deployment` or `StatefulSet` |
| `image:` | `image:` (same) |
| `ports:` | `Service` (NodePort/ClusterIP) |
| `volumes:` (named) | `PersistentVolumeClaim` |
| `env_file:` | `ConfigMap` + `envFrom` |
| `environment:` | `env:` in container spec |
| `depends_on:` | `initContainers` + `readinessProbe` |
| `container_name:` | Pod name (auto-generated) |
| `hostname:` | `subdomain` + headless `Service` |
| `restart: always` | `restartPolicy: Always` (default) |
| `networks:` | `Namespace` + `Service` selectors |
