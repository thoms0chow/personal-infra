import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { AutoScalingGroup } from "aws-cdk-lib/aws-autoscaling";
import { BuildSpec, Project, Source } from "aws-cdk-lib/aws-codebuild";
import {
  InstanceType,
  Peer,
  Port,
  SecurityGroup,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Repository } from "aws-cdk-lib/aws-ecr";
import {
  AsgCapacityProvider,
  Capability,
  Cluster,
  ContainerImage,
  CpuArchitecture,
  Ec2Service,
  Ec2TaskDefinition,
  EcsOptimizedImage,
  FargateService,
  FargateTaskDefinition,
  LinuxParameters,
  LogDrivers,
  MachineImageType,
  Secret,
} from "aws-cdk-lib/aws-ecs";
import {
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import * as path from "path";

export interface ProxyStackProps extends StackProps {
  vpc: Vpc;
}

export class ProxyStack extends Stack {
  constructor(scope: Construct, id: string, props: ProxyStackProps) {
    super(scope, id, props);

    // Common settings
    const resourceName = "PersonalProxyStack";

    // #region ECS
    const proxyClusterName = resourceName + "-Proxy-Cluster";
    const proxyCluster = new Cluster(this, proxyClusterName, {
      clusterName: proxyClusterName,
      vpc: props.vpc,
    });

    const proxyTaskDef = new FargateTaskDefinition(
      this,
      `${resourceName}-Proxy-FargateTaskDefinition`,
      {
        runtimePlatform: {
          cpuArchitecture: CpuArchitecture.ARM64,
        },
      }
    );

    const proxyContainerLogGroup = new LogGroup(
      this,
      `${resourceName}-Proxy-LogGroup`,
      {
        logGroupName: "/aws/ecs/proxy",
        retention: RetentionDays.THREE_DAYS,
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );

    const ssAlgorithmParameter = Secret.fromSsmParameter(
      StringParameter.fromSecureStringParameterAttributes(
        this,
        `${resourceName}-Proxy-Algo`,
        {
          parameterName: "/proxy/SS_ALGORITHM",
        }
      )
    );

    const ssPasswordParameter = Secret.fromSsmParameter(
      StringParameter.fromSecureStringParameterAttributes(
        this,
        `${resourceName}-Proxy-Password`,
        {
          parameterName: "/proxy/SS_PASSWORD",
        }
      )
    );

    proxyTaskDef.addContainer(`${resourceName}-Proxy-Container`, {
      image: ContainerImage.fromAsset(path.join(__dirname, "proxy")),
      containerName: "proxy",
      secrets: {
        SS_ALGORITHM: ssAlgorithmParameter,
        SS_PASSWORD: ssPasswordParameter,
      },
      logging: LogDrivers.awsLogs({
        streamPrefix: "proxy",
        logGroup: proxyContainerLogGroup,
      }),
    });

    const proxyServiceSecurityGroup = new SecurityGroup(
      this,
      `${resourceName}-Proxy-SecurityGroup`,
      {
        vpc: props.vpc,
      }
    );
    proxyServiceSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(8388));
    proxyServiceSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.udp(8388));

    const proxyServiceName = `${resourceName}-Proxy-Service`;
    const proxyService = new FargateService(this, proxyServiceName, {
      serviceName: proxyServiceName,
      cluster: proxyCluster,
      taskDefinition: proxyTaskDef,
      desiredCount: 1,
      securityGroups: [proxyServiceSecurityGroup],
      assignPublicIp: true,
    });

    // #endregion

    // #region Shadowsocks & WARP
    if (this.node.tryGetContext("useWarp")) {
      const containerName = "ProxyWithWarp";
      const repo = new Repository(this, `${resourceName}-ProxyWithWarp-Repo`, {
        repositoryName: "proxy/with-warp",
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const asg = new AutoScalingGroup(
        this,
        `${resourceName}-ProxyWithWarp-Asg`,
        {
          vpc: props.vpc,
          instanceType: new InstanceType("t2.micro"),
          desiredCapacity: 1,
          associatePublicIpAddress: true,
          machineImage: EcsOptimizedImage.amazonLinux2(),
        }
      );
      const capacityProvider = new AsgCapacityProvider(
        this,
        `${resourceName}-ProxyEc2-AsgCapacityProvider`,
        {
          autoScalingGroup: asg,
          machineImageType: MachineImageType.AMAZON_LINUX_2,
        }
      );
      proxyCluster.addAsgCapacityProvider(capacityProvider);

      const proxyWithWarpTaskDef = new Ec2TaskDefinition(
        this,
        `${resourceName}-ProxyWithWarp-Ec2TaskDefinition`
      );

      const proxyWithWarpContainerLinuxParameters = new LinuxParameters(
        this,
        `${resourceName}-ProxyWithWarp-LinuxParameters`
      );
      proxyWithWarpContainerLinuxParameters.addCapabilities(
        Capability.NET_ADMIN,
        Capability.SYS_ADMIN
      );

      proxyWithWarpTaskDef.addContainer(
        `${resourceName}-ProxyWithWarp-Container`,
        {
          image: ContainerImage.fromEcrRepository(repo),
          containerName,
          secrets: {
            SS_ALGORITHM: ssAlgorithmParameter,
            SS_PASSWORD: ssPasswordParameter,
          },
          logging: LogDrivers.awsLogs({
            streamPrefix: "proxy-with-warp",
            logGroup: proxyContainerLogGroup,
          }),
          systemControls: [
            {
              namespace: "net.ipv6.conf.all.disable_ipv6",
              value: "0",
            },
            {
              namespace: "net.ipv4.conf.all.src_valid_mark",
              value: "1",
            },
          ],
          memoryLimitMiB: 512,
          privileged: true,
          portMappings: [
            {
              containerPort: 9091,
            },
          ],
          /*
          healthCheck: {
            command: [
              "CMD",
              "curl",
              "-f",
              "https://www.cloudflare.com/cdn-cig/trace",
            ],
            interval: Duration.seconds(30),
            timeout: Duration.seconds(10),
            retries: 5,
          },
          */
        }
      );

      const proxyWithWarpServiceName = `${resourceName}-ProxyWithWarp-Service`;
      const proxyWithWarpService = new Ec2Service(
        this,
        proxyWithWarpServiceName,
        {
          serviceName: proxyWithWarpServiceName,
          cluster: proxyCluster,
          taskDefinition: proxyWithWarpTaskDef,
          desiredCount: 1,
          enableExecuteCommand: true,
          // securityGroups: [proxyServiceSecurityGroup],
          // assignPublicIp: true,
        }
      );

      const projectRoleName = `${resourceName}-ProxyWithWarpCodebuild-Role`;
      const projectRole = new Role(this, projectRoleName, {
        assumedBy: new ServicePrincipal("codebuild.amazonaws.com"),
        roleName: projectRoleName,
        inlinePolicies: {
          updateEcsService: new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: ["ecs:UpdateService"],
                resources: [proxyWithWarpService.serviceArn],
              }),
            ],
          }),
        },
      });
      const project = new Project(
        this,
        `${resourceName}-ProxyWithWarp-Project`,
        {
          source: Source.gitHub({
            owner: "thomas0chow",
            repo: "personal-infra",
            branchOrRef: "feature/warp",
          }),
          buildSpec: BuildSpec.fromAsset(
            path.join(__dirname, "proxy-with-warp")
          ),
          environmentVariables: {
            AWS_DEFAULT_REGION: {
              value: Stack.of(this).region,
            },
            AWS_ACCOUNT_ID: {
              value: Stack.of(this).account,
            },
            IMAGE_REPO_NAME: {
              value: repo.repositoryName,
            },
            IMAGE_TAG: {
              value: "latest",
            },
            SERVICE_NAME: {
              value: proxyWithWarpService.serviceName,
            },
            CLUSTER_NAME: {
              value: proxyCluster.clusterName,
            },
          },
          environment: {
            privileged: true,
          },
        }
      );
      repo.grantPullPush(project);
      // #endregion
    }
  }
}
